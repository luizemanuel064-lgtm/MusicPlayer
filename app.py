import os
from flask import Flask, send_from_directory, request, jsonify, session
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3, functools
# 1. Importe a biblioteca nova
from dotenv import load_dotenv

# 2. Carregue o arquivo .env
load_dotenv()

app = Flask(__name__, static_folder='static')

# 3. Pegue a chave do ambiente. 
# Se por acaso esquecer de configurar no servidor, o segundo argumento funciona como um plano B seguro.
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'chave-provisoria-de-desenvolvimento-super-secreta')
CORS(app, supports_credentials=True)

DB = 'musicpoo.db'

# ─── Banco de dados ────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT    UNIQUE NOT NULL,
                email    TEXT    UNIQUE NOT NULL,
                password TEXT    NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL,
                nome       TEXT    NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id  INTEGER NOT NULL,
                track_id     TEXT    NOT NULL,
                titulo       TEXT,
                artista      TEXT,
                album        TEXT,
                duracao      INTEGER,
                preview_url  TEXT,
                capa         TEXT,
                added_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id)
            );

            CREATE TABLE IF NOT EXISTS recentes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                track_id    TEXT    NOT NULL,
                titulo      TEXT,
                artista     TEXT,
                album       TEXT,
                duracao     INTEGER,
                preview_url TEXT,
                capa        TEXT,
                played_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        ''')

init_db()

# ─── Classes POO ──────────────────────────────────────────────────────────────

class Musica:
    def __init__(self, id, titulo, artista, album, duracao, preview_url, capa):
        self.id = id; self.titulo = titulo; self.artista = artista
        self.album = album; self.duracao = duracao
        self.preview_url = preview_url; self.capa = capa

    def to_dict(self):
        return vars(self)


class Playlist:
    def __init__(self, nome=""):
        self.nome = nome
        self._faixas: list[Musica] = []

    def adicionar(self, musica: Musica):
        self._faixas.append(musica)

    def remover(self, index: int):
        if 0 <= index < len(self._faixas):
            self._faixas.pop(index)

    def listar(self):
        return [m.to_dict() for m in self._faixas]

    def __len__(self):
        return len(self._faixas)


class BuscadorMusica:
    def criar_playlist_vazia(self, nome: str) -> Playlist:
        return Playlist(nome)

    def montar_musica(self, dados: dict) -> Musica:
        return Musica(
            id          = dados.get("id"),
            titulo      = dados.get("titulo", ""),
            artista     = dados.get("artista", ""),
            album       = dados.get("album", ""),
            duracao     = dados.get("duracao", 30),
            preview_url = dados.get("preview_url", ""),
            capa        = dados.get("capa", "")
        )


# ─── Decorator de autenticação ─────────────────────────────────────────────────

def login_required(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Não autenticado'}), 401
        return f(*args, **kwargs)
    return wrapper

# ─── Auth Routes ──────────────────────────────────────────────────────────────

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    username = (data.get('username') or '').strip()
    email    = (data.get('email')    or '').strip()
    password = (data.get('password') or '').strip()

    if not username or not email or not password:
        return jsonify({'error': 'Preencha todos os campos'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Senha deve ter ao menos 6 caracteres'}), 400

    hashed = generate_password_hash(password)
    try:
        with get_db() as db:
            db.execute('INSERT INTO users (username, email, password) VALUES (?,?,?)',
                       (username, email, hashed))
            user = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()
            # Criar playlist Favoritos automática
            db.execute('INSERT INTO playlists (user_id, nome) VALUES (?,?)', (user['id'], 'Favoritos'))
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({'ok': True, 'username': user['username']})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Usuário ou e-mail já cadastrado'}), 409


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    email    = (data.get('email')    or '').strip()
    password = (data.get('password') or '').strip()

    if not email or not password:
        return jsonify({'error': 'Preencha todos os campos'}), 400

    with get_db() as db:
        user = db.execute('SELECT * FROM users WHERE email=?', (email,)).fetchone()

    if not user or not check_password_hash(user['password'], password):
        return jsonify({'error': 'E-mail ou senha incorretos'}), 401

    session['user_id'] = user['id']
    session['username'] = user['username']
    return jsonify({'ok': True, 'username': user['username']})


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'ok': True})


@app.route('/api/me')
def me():
    if 'user_id' not in session:
        return jsonify({'authenticated': False})
    return jsonify({'authenticated': True, 'username': session['username']})

# ─── Playlists ────────────────────────────────────────────────────────────────

@app.route('/api/playlists', methods=['GET'])
@login_required
def get_playlists():
    with get_db() as db:
        rows = db.execute(
            'SELECT p.*, COUNT(pt.id) as total FROM playlists p '
            'LEFT JOIN playlist_tracks pt ON pt.playlist_id=p.id '
            'WHERE p.user_id=? GROUP BY p.id ORDER BY p.created_at',
            (session['user_id'],)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/playlists', methods=['POST'])
@login_required
def create_playlist():
    data = request.json or {}
    nome = (data.get('nome') or '').strip()
    if not nome:
        return jsonify({'error': 'Nome obrigatório'}), 400
    with get_db() as db:
        cur = db.execute('INSERT INTO playlists (user_id, nome) VALUES (?,?)',
                         (session['user_id'], nome))
        pl = db.execute('SELECT * FROM playlists WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(dict(pl)), 201


@app.route('/api/playlists/<int:pid>', methods=['DELETE'])
@login_required
def delete_playlist(pid):
    with get_db() as db:
        pl = db.execute('SELECT * FROM playlists WHERE id=? AND user_id=?',
                        (pid, session['user_id'])).fetchone()
        if not pl:
            return jsonify({'error': 'Não encontrada'}), 404
        if pl['nome'] == 'Favoritos':
            return jsonify({'error': 'Não é possível remover os Favoritos'}), 400
        db.execute('DELETE FROM playlist_tracks WHERE playlist_id=?', (pid,))
        db.execute('DELETE FROM playlists WHERE id=?', (pid,))
    return jsonify({'ok': True})


@app.route('/api/playlists/<int:pid>/tracks', methods=['GET'])
@login_required
def get_playlist_tracks(pid):
    with get_db() as db:
        pl = db.execute('SELECT * FROM playlists WHERE id=? AND user_id=?',
                        (pid, session['user_id'])).fetchone()
        if not pl:
            return jsonify({'error': 'Não encontrada'}), 404
        rows = db.execute(
            'SELECT * FROM playlist_tracks WHERE playlist_id=? ORDER BY added_at',
            (pid,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/playlists/<int:pid>/tracks', methods=['POST'])
@login_required
def add_to_playlist(pid):
    with get_db() as db:
        pl = db.execute('SELECT * FROM playlists WHERE id=? AND user_id=?',
                        (pid, session['user_id'])).fetchone()
        if not pl:
            return jsonify({'error': 'Não encontrada'}), 404
        t = request.json or {}
        # Evita duplicata
        exists = db.execute(
            'SELECT id FROM playlist_tracks WHERE playlist_id=? AND track_id=?',
            (pid, str(t.get('id','')))).fetchone()
        if exists:
            return jsonify({'error': 'Já está na playlist'}), 409
        db.execute(
            'INSERT INTO playlist_tracks (playlist_id,track_id,titulo,artista,album,duracao,preview_url,capa) '
            'VALUES (?,?,?,?,?,?,?,?)',
            (pid, str(t.get('id','')), t.get('titulo',''), t.get('artista',''),
             t.get('album',''), t.get('duracao',30), t.get('preview_url',''), t.get('capa',''))
        )
    return jsonify({'ok': True}), 201

@app.route('/api/playlists/<int:pid>/tracks/<track_id>', methods=['DELETE'])
@login_required
def remove_from_playlist(pid, track_id):
    with get_db() as db:
        # Deleta a faixa APENAS SE a playlist informada (pid) pertencer ao usuário logado
        cursor = db.execute('''
            DELETE FROM playlist_tracks 
            WHERE track_id = ? 
              AND playlist_id = ?
              AND playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)
        ''', (track_id, pid, session['user_id']))
        
        # O cursor.rowcount diz quantas linhas foram afetadas. 
        # Se for 0, significa que a música não existia ou a playlist não era do usuário.
        if cursor.rowcount == 0:
            return jsonify({'error': 'Playlist ou faixa não encontrada'}), 404
            
    return jsonify({'ok': True})
# ─── Recentes ─────────────────────────────────────────────────────────────────

@app.route('/api/recentes', methods=['GET'])
@login_required
def get_recentes():
    with get_db() as db:
        rows = db.execute(
            'SELECT * FROM recentes WHERE user_id=? ORDER BY played_at DESC LIMIT 50',
            (session['user_id'],)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/recentes', methods=['POST'])
@login_required
def add_recente():
    t = request.json or {}
    with get_db() as db:
        db.execute('DELETE FROM recentes WHERE user_id=? AND track_id=?',
                   (session['user_id'], str(t.get('id',''))))
        db.execute(
            'INSERT INTO recentes (user_id,track_id,titulo,artista,album,duracao,preview_url,capa) '
            'VALUES (?,?,?,?,?,?,?,?)',
            (session['user_id'], str(t.get('id','')), t.get('titulo',''), t.get('artista',''),
             t.get('album',''), t.get('duracao',30), t.get('preview_url',''), t.get('capa',''))
        )
        # Limitar a 50
        db.execute(
            'DELETE FROM recentes WHERE user_id=? AND id NOT IN '
            '(SELECT id FROM recentes WHERE user_id=? ORDER BY played_at DESC LIMIT 50)',
            (session['user_id'], session['user_id'])
        )
    return jsonify({'ok': True})

# ─── Static ───────────────────────────────────────────────────────────────────

@app.route('/')
@app.route('/<path:path>')
def serve(path='index.html'):
    return send_from_directory('static', path)

if __name__ == '__main__':
    # Se FLASK_ENV for 'development', o debug será True. Caso contrário (produção), será False.
    ambiente_desenvolvimento = (os.environ.get('FLASK_ENV') == 'development')

    print(f"🎵 MusicPOO rodando em http://localhost:5000 [Debug: {ambiente_desenvolvimento}]")
    app.run(debug=ambiente_desenvolvimento, port=5001)