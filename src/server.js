const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, '..', 'data', 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      users: [],
      accounts: [],
      transactions: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

function readData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createToken(userId) {
  return Buffer.from(`${userId}:${Date.now()}`).toString('base64url');
}

function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não enviado.' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const data = readData();
  const user = data.users.find((u) => u.token === token);

  if (!user) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  req.user = user;
  req.data = data;
  next();
}

app.post('/api/signup', (req, res) => {
  const { name, email, password, cep } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const data = readData();
  const alreadyExists = data.users.some((u) => u.email.toLowerCase() === email.toLowerCase());

  if (alreadyExists) {
    return res.status(409).json({ error: 'E-mail já cadastrado.' });
  }

  const user = {
    id: makeId('usr'),
    name,
    email,
    passwordHash: hashPassword(password),
    cep: cep || '',
    createdAt: new Date().toISOString(),
    token: ''
  };

  data.users.push(user);

  const account = {
    id: makeId('acc'),
    userId: user.id,
    number: String(100000 + data.accounts.length),
    type: 'corrente',
    balance: 0,
    createdAt: new Date().toISOString()
  };

  data.accounts.push(account);
  writeData(data);

  res.status(201).json({
    message: 'Cadastro realizado com sucesso.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    },
    account
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  const data = readData();
  const user = data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());

  if (!user || user.passwordHash !== hashPassword(password || '')) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = createToken(user.id);
  user.token = token;
  writeData(data);

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
});

app.get('/api/me', auth, (req, res) => {
  const userAccounts = req.data.accounts.filter((a) => a.userId === req.user.id);
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      cep: req.user.cep
    },
    accounts: userAccounts
  });
});

app.post('/api/accounts', auth, (req, res) => {
  const { type } = req.body;
  const account = {
    id: makeId('acc'),
    userId: req.user.id,
    number: String(100000 + req.data.accounts.length),
    type: type || 'corrente',
    balance: 0,
    createdAt: new Date().toISOString()
  };
  req.data.accounts.push(account);
  writeData(req.data);

  res.status(201).json(account);
});

app.get('/api/statement/:accountId', auth, (req, res) => {
  const { accountId } = req.params;
  const account = req.data.accounts.find((a) => a.id === accountId && a.userId === req.user.id);

  if (!account) {
    return res.status(404).json({ error: 'Conta não encontrada.' });
  }

  const statement = req.data.transactions
    .filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ account, statement });
});

app.post('/api/deposit', auth, (req, res) => {
  const { accountId, amount } = req.body;
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: 'Valor inválido.' });
  }

  const account = req.data.accounts.find((a) => a.id === accountId && a.userId === req.user.id);
  if (!account) {
    return res.status(404).json({ error: 'Conta não encontrada.' });
  }

  account.balance += value;
  const transaction = {
    id: makeId('trx'),
    type: 'deposito',
    amount: value,
    toAccountId: account.id,
    fromAccountId: null,
    description: 'Depósito',
    date: new Date().toISOString()
  };

  req.data.transactions.push(transaction);
  writeData(req.data);

  res.status(201).json({ message: 'Depósito realizado.', account, transaction });
});

app.post('/api/withdraw', auth, (req, res) => {
  const { accountId, amount } = req.body;
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: 'Valor inválido.' });
  }

  const account = req.data.accounts.find((a) => a.id === accountId && a.userId === req.user.id);
  if (!account) {
    return res.status(404).json({ error: 'Conta não encontrada.' });
  }

  if (account.balance < value) {
    return res.status(400).json({ error: 'Saldo insuficiente.' });
  }

  account.balance -= value;
  const transaction = {
    id: makeId('trx'),
    type: 'saque',
    amount: value,
    fromAccountId: account.id,
    toAccountId: null,
    description: 'Saque',
    date: new Date().toISOString()
  };

  req.data.transactions.push(transaction);
  writeData(req.data);

  res.status(201).json({ message: 'Saque realizado.', account, transaction });
});

app.post('/api/transfer', auth, (req, res) => {
  const { fromAccountId, toAccountNumber, amount } = req.body;
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ error: 'Valor inválido.' });
  }

  const from = req.data.accounts.find((a) => a.id === fromAccountId && a.userId === req.user.id);
  const to = req.data.accounts.find((a) => a.number === String(toAccountNumber));

  if (!from || !to) {
    return res.status(404).json({ error: 'Conta de origem ou destino não encontrada.' });
  }

  if (from.id === to.id) {
    return res.status(400).json({ error: 'Não é possível transferir para a mesma conta.' });
  }

  if (from.balance < value) {
    return res.status(400).json({ error: 'Saldo insuficiente.' });
  }

  from.balance -= value;
  to.balance += value;

  const transaction = {
    id: makeId('trx'),
    type: 'transferencia',
    amount: value,
    fromAccountId: from.id,
    toAccountId: to.id,
    description: `Transferência para conta ${to.number}`,
    date: new Date().toISOString()
  };

  req.data.transactions.push(transaction);
  writeData(req.data);

  res.status(201).json({ message: 'Transferência realizada.', transaction, fromAccount: from });
});

app.get('/api/cep/:cep', async (req, res) => {
  const cep = String(req.params.cep || '').replace(/\D/g, '');
  if (cep.length !== 8) {
    return res.status(400).json({ error: 'CEP inválido.' });
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();

    if (data.erro) {
      return res.status(404).json({ error: 'CEP não encontrado.' });
    }

    res.json(data);
  } catch (error) {
    res.status(502).json({ error: 'Falha ao consumir API de CEP.' });
  }
});

app.get('/api/rates/usd-brl', async (_req, res) => {
  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const data = await response.json();
    const quote = data.USDBRL;
    if (!quote) {
      return res.status(502).json({ error: 'Cotação indisponível.' });
    }
    res.json({
      bid: Number(quote.bid),
      ask: Number(quote.ask),
      updatedAt: quote.create_date
    });
  } catch (error) {
    res.status(502).json({ error: 'Falha ao consumir API de cotação.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
