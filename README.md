# Sistema de Gestão de Condomínios 🏢

Sistema profissional de gestão de condomínios focado em Síndicos e Contadores. Substitui completamente o trabalho manual em Excel com funcionalidades completas de contabilidade, gestão de moradores e controle de cobranças.

## 🚀 Funcionalidades

### Dashboard
- Métricas financeiras em tempo real
- Gráficos interativos de fluxo de caixa
- Análise de inadimplência
- Alertas críticos

### Módulo Contábil
- **Contas a Pagar**: Gestão de despesas e fornecedores
- **Contas a Receber**: Controle de receitas e pagamentos
- **Folha de Pagamento**: Cálculo automático de salários e encargos
- **Relatórios**: Balancetes, DRE, Fluxo de Caixa

### Gestão de Moradores
- Cadastro completo de moradores
- Upload de documentos com drag-and-drop
- Histórico financeiro individual
- Controle de veículos e pets

### Cobranças e Protestos
- Identificação automática de inadimplentes
- Gestão completa do processo de protesto
- Geração de documentos legais
- Timeline de acompanhamento

## 🛠️ Tecnologias

- **Frontend**: React + Vite
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Gráficos**: Recharts
- **Estilização**: CSS moderno com design system profissional

## 📦 Instalação

### Pré-requisitos
- Node.js 18+ e npm

### Passos

1. **Clone o repositório**
```bash
cd condo-manager
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure o Supabase**

   a. Crie um projeto no [Supabase](https://supabase.com)
   
   b. Execute o script SQL em `supabase/schema.sql` no SQL Editor do Supabase
   
   c. Copie as credenciais do projeto

4. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
```

Edite o arquivo `.env` e adicione suas credenciais do Supabase:
```env
VITE_SUPABASE_URL=sua-url-do-supabase
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
```

5. **Inicie o servidor de desenvolvimento**
```bash
npm run dev
```

O sistema estará disponível em `http://localhost:3000`

## 🌐 Deploy

### Vercel (Recomendado)

1. **Instale a Vercel CLI**
```bash
npm i -g vercel
```

2. **Deploy**
```bash
npm run build
vercel --prod
```

3. **Configure as variáveis de ambiente** no painel da Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Outras plataformas

O projeto pode ser deployado em qualquer plataforma que suporte sites estáticos:
- Netlify
- GitHub Pages
- Cloudflare Pages

## 🔐 Autenticação

Para criar usuários (Síndico/Contador):

1. Acesse o painel do Supabase
2. Vá em **Authentication** > **Users**
3. Clique em **Add user**
4. Adicione email e senha

## 📚 Estrutura do Projeto

```
condo-manager/
├── src/
│   ├── components/
│   │   └── layout/
│   ├── lib/
│   │   └── supabase.js
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── AccountsPayable.jsx
│   │   ├── AccountsReceivable.jsx
│   │   ├── Residents.jsx
│   │   ├── Collections.jsx
│   │   ├── Payroll.jsx
│   │   └── Reports.jsx
│   ├── styles/
│   │   └── globals.css
│   ├── App.jsx
│   └── main.jsx
├── supabase/
│   └── schema.sql
├── index.html
├── package.json
└── vite.config.js
```

## 🎨 Design System

O sistema utiliza um design profissional com:
- Paleta de cores moderna
- Componentes reutilizáveis
- Animações suaves
- Layout responsivo
- Modo escuro (em desenvolvimento)

## 📊 Próximas Funcionalidades

- [ ] Implementação completa de todos os módulos
- [ ] Geração de PDFs para relatórios
- [ ] Integração com APIs bancárias
- [ ] Notificações por email/SMS
- [ ] App mobile
- [ ] Modo offline

## 📄 Licença

Proprietary - Todos os direitos reservados

## 🤝 Suporte

Para suporte, entre em contato com o administrador do sistema.
