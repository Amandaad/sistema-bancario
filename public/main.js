import 'zone.js';
import '@angular/compiler';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { bootstrapApplication } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="container">
      <h1>Sistema Bancário (Node + Angular)</h1>

      <section class="grid">
        <div class="card">
          <h2>Sign Up</h2>
          <input [(ngModel)]="signup.name" placeholder="Nome" />
          <input [(ngModel)]="signup.email" type="email" placeholder="E-mail" />
          <input [(ngModel)]="signup.password" type="password" placeholder="Senha" />
          <input [(ngModel)]="signup.cep" placeholder="CEP" />
          <button (click)="buscarCep()">Buscar CEP</button>
          <small>{{ cepResultado }}</small>
          <button (click)="signupUser()">Cadastrar</button>
        </div>

        <div class="card">
          <h2>Login</h2>
          <input [(ngModel)]="login.email" type="email" placeholder="E-mail" />
          <input [(ngModel)]="login.password" type="password" placeholder="Senha" />
          <button (click)="loginUser()">Entrar</button>
        </div>
      </section>

      <section *ngIf="authenticated" class="grid">
        <div class="card">
          <h2>Contas</h2>
          <button (click)="loadMe()">Atualizar contas</button>
          <button (click)="novaConta()">Criar nova conta</button>
          <ul>
            <li *ngFor="let acc of accounts">ID: {{acc.id}} | Nº: {{acc.number}} | Tipo: {{acc.type}} | Saldo: R$ {{acc.balance}}</li>
          </ul>
        </div>

        <div class="card">
          <h2>Depósito</h2>
          <input [(ngModel)]="deposit.accountId" placeholder="ID da conta" />
          <input [(ngModel)]="deposit.amount" type="number" placeholder="Valor" />
          <button (click)="operacao('/api/deposit', deposit, 'Depósito realizado')">Depositar</button>

          <h2>Saque</h2>
          <input [(ngModel)]="withdraw.accountId" placeholder="ID da conta" />
          <input [(ngModel)]="withdraw.amount" type="number" placeholder="Valor" />
          <button (click)="operacao('/api/withdraw', withdraw, 'Saque realizado')">Sacar</button>
        </div>

        <div class="card">
          <h2>Transferência</h2>
          <input [(ngModel)]="transfer.fromAccountId" placeholder="ID origem" />
          <input [(ngModel)]="transfer.toAccountNumber" placeholder="Nº conta destino" />
          <input [(ngModel)]="transfer.amount" type="number" placeholder="Valor" />
          <button (click)="operacao('/api/transfer', transfer, 'Transferência realizada')">Transferir</button>
        </div>

        <div class="card">
          <h2>Extrato</h2>
          <input [(ngModel)]="statementAccountId" placeholder="ID da conta" />
          <button (click)="extrato()">Ver extrato</button>
          <ul>
            <li *ngFor="let t of statement">{{t.date}} | {{t.type}} | R$ {{t.amount}} | {{t.description}}</li>
          </ul>
        </div>

        <div class="card">
          <h2>API externa (USD-BRL)</h2>
          <button (click)="cotacao()">Buscar cotação</button>
          <p>{{ rate }}</p>
        </div>
      </section>

      <p [style.color]="error ? 'crimson' : 'green'">{{ message }}</p>
    </main>
  `
})
class AppComponent {
  token = localStorage.getItem('token') || '';
  authenticated = !!this.token;
  message = '';
  error = false;
  cepResultado = '';
  rate = '';
  accounts = [];
  statement = [];
  statementAccountId = '';

  signup = { name: '', email: '', password: '', cep: '' };
  login = { email: '', password: '' };
  deposit = { accountId: '', amount: 0 };
  withdraw = { accountId: '', amount: 0 };
  transfer = { fromAccountId: '', toAccountNumber: '', amount: 0 };

  constructor() {
    if (this.token) this.loadMe();
  }

  async api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  setMessage(text, isError = false) {
    this.message = text;
    this.error = isError;
  }

  async signupUser() {
    try {
      await this.api('/api/signup', { method: 'POST', body: JSON.stringify(this.signup) });
      this.setMessage('Cadastro concluído. Faça login.');
      this.signup = { name: '', email: '', password: '', cep: '' };
    } catch (e) {
      this.setMessage(e.message, true);
    }
  }

  async loginUser() {
    try {
      const data = await this.api('/api/login', { method: 'POST', body: JSON.stringify(this.login) });
      this.token = data.token;
      localStorage.setItem('token', this.token);
      this.authenticated = true;
      await this.loadMe();
      this.setMessage(`Bem-vindo, ${data.user.name}!`);
    } catch (e) {
      this.setMessage(e.message, true);
    }
  }

  async loadMe() {
    try {
      const data = await this.api('/api/me');
      this.accounts = data.accounts;
    } catch (e) {
      this.setMessage(e.message, true);
    }
  }

  async novaConta() {
    return this.operacao('/api/accounts', { type: 'poupança' }, 'Nova conta criada');
  }

  async operacao(endpoint, payload, success) {
    try {
      await this.api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      await this.loadMe();
      this.setMessage(success);
    } catch (e) {
      this.setMessage(e.message, true);
    }
  }

  async extrato() {
    try {
      const data = await this.api(`/api/statement/${this.statementAccountId}`);
      this.statement = data.statement.map((t) => ({ ...t, date: new Date(t.date).toLocaleString() }));
      this.setMessage('Extrato carregado');
    } catch (e) {
      this.setMessage(e.message, true);
    }
  }

  async buscarCep() {
    try {
      const data = await this.api(`/api/cep/${this.signup.cep}`);
      this.cepResultado = `${data.logradouro || ''} - ${data.localidade}/${data.uf}`;
      this.setMessage('CEP consultado');
    } catch (e) {
      this.cepResultado = '';
      this.setMessage(e.message, true);
    }
  }

  async cotacao() {
    try {
      const data = await this.api('/api/rates/usd-brl');
      this.rate = `Compra: ${data.bid} | Venda: ${data.ask} | Atualizado: ${data.updatedAt}`;
      this.setMessage('Cotação atualizada');
    } catch (e) {
      this.rate = '';
      this.setMessage(e.message, true);
    }
  }
}

bootstrapApplication(AppComponent).catch((err) => console.error(err));
