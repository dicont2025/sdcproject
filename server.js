const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'posts.json');
const TEACHERS_FILE = path.join(__dirname, 'next_week_teachers.json');
const MAP_FILE = path.join(__dirname, 'sdc_map_data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ──────────────────────────────────────────
function loadPosts() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
function savePosts(posts) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2), 'utf-8');
}
function loadTeachers() {
  if (!fs.existsSync(TEACHERS_FILE)) fs.writeFileSync(TEACHERS_FILE, '{}', 'utf-8');
  return JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf-8'));
}

// ── map data ─────────────────────────────────────────
app.get('/api/mapdata', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8')));
});

// ── next-week teacher assignment ──────────────────────
app.get('/api/nextweek-teachers', (req, res) => {
  res.json(loadTeachers());
});

app.put('/api/nextweek-teachers/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { teacher } = req.body;
  const teachers = loadTeachers();
  if (teacher && teacher.trim()) {
    teachers[name] = teacher.trim();
  } else {
    delete teachers[name];
  }
  fs.writeFileSync(TEACHERS_FILE, JSON.stringify(teachers, null, 2), 'utf-8');
  res.json({ name, teacher: teachers[name] || null });
});

// ── posts ─────────────────────────────────────────────
app.get('/api/posts', (req, res) => {
  const posts = loadPosts()
    .map(({ pw: _, ...p }) => p)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(posts);
});

app.post('/api/posts', async (req, res) => {
  const { author, pw, body } = req.body;
  if (!author || !pw || !body)
    return res.status(400).json({ error: 'author, pw, body는 필수입니다.' });

  const posts = loadPosts();
  const post = {
    id: uuidv4(),
    author,
    pw: await bcrypt.hash(pw, 10),
    body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
  };
  posts.push(post);
  savePosts(posts);
  const { pw: _, ...safe } = post;
  res.status(201).json(safe);
});

app.put('/api/posts/:id', async (req, res) => {
  const { pw, body } = req.body;
  if (!pw || !body)
    return res.status(400).json({ error: 'pw, body는 필수입니다.' });

  const posts = loadPosts();
  const idx = posts.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  if (!await bcrypt.compare(pw, posts[idx].pw))
    return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });

  posts[idx].body = body;
  posts[idx].updatedAt = new Date().toISOString();
  savePosts(posts);
  const { pw: _, ...safe } = posts[idx];
  res.json(safe);
});

app.delete('/api/posts/:id', async (req, res) => {
  const { pw } = req.body;
  if (!pw) return res.status(400).json({ error: 'pw는 필수입니다.' });

  const posts = loadPosts();
  const idx = posts.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  if (!await bcrypt.compare(pw, posts[idx].pw))
    return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });

  posts.splice(idx, 1);
  savePosts(posts);
  res.json({ message: '삭제되었습니다.' });
});

app.post('/api/posts/:id/comments', (req, res) => {
  const { author, body } = req.body;
  if (!author || !body)
    return res.status(400).json({ error: 'author, body는 필수입니다.' });

  const posts = loadPosts();
  const idx = posts.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

  const comment = { id: uuidv4(), author, body, createdAt: new Date().toISOString() };
  posts[idx].comments.push(comment);
  savePosts(posts);
  res.status(201).json(comment);
});

app.listen(PORT, () => {
  console.log(`서버 실행중 http://localhost:${PORT}`);
});
