# Auditoria Interna Raguife — guia de implantação

Sistema web para a auditoria mensal por amostragem dos processos de **Departamento Pessoal, Segurança do Trabalho, Ambulatório e Recursos Humanos**.

- **Hospedagem:** GitHub Pages (site estático, sem servidor)
- **Login e banco de dados:** Firebase Authentication + Cloud Firestore
- **Sem Firebase configurado**, o sistema abre em **modo demonstração** (login `admin@demo` / `demo123`, dados só no navegador). Serve para testar antes de implantar.

> Use **contas da empresa** (e-mail corporativo) para criar o projeto no Firebase e a organização no GitHub. Se alguém sair da empresa, o sistema continua.

---

## 1. Criar o projeto no Firebase (≈ 15 min)

1. Acesse <https://console.firebase.google.com> com a conta da empresa → **Adicionar projeto** → nome, por exemplo, `auditoria-raguife`. O Google Analytics pode ficar desativado.
2. **Authentication** → *Vamos começar* → aba **Método de login** → ative **E-mail/senha**.
   - **Não** desative "Ativar criação (inscrição)" em *Configurações → Ações do usuário*: o sistema usa essa função para o administrador criar usuários. Mesmo que alguém crie um login por fora, ele não acessa nada sem um perfil cadastrado pelo administrador (as regras do Firestore bloqueiam).
3. **Firestore Database** → *Criar banco de dados* → local **southamerica-east1 (São Paulo)** → modo **produção**.
4. Em **Firestore → Regras**, apague o conteúdo, cole o arquivo `firestore.rules` deste pacote e clique em **Publicar**.
5. **Configurações do projeto** (engrenagem) → **Seus apps** → ícone **Web `</>`** → registre o app (não precisa de Hosting). Copie os valores de `firebaseConfig` e cole no arquivo **`js/config.js`**.

## 2. Criar o primeiro administrador (uma única vez)

1. Firebase → **Authentication → Usuários → Adicionar usuário**: seu e-mail e uma senha. Copie o **UID** que aparece na lista.
2. Firebase → **Firestore → Iniciar coleção** → ID da coleção: `usuarios` → ID do documento: **cole o UID** → campos:

   | Campo | Tipo | Valor |
   |---|---|---|
   | `nome` | string | Seu nome |
   | `email` | string | seu e-mail |
   | `perfil` | string | `admin` |
   | `areas` | array | `dp`, `sst`, `amb`, `rh` (quatro itens string) |
   | `ativo` | boolean | `true` |

A partir daí, todos os outros usuários são criados **dentro do sistema**, em *Usuários*.

## 3. Publicar no GitHub Pages (≈ 10 min)

1. Crie uma conta/organização da empresa em <https://github.com> e um repositório, por exemplo, `auditoria-raguife`.
2. Envie **todos os arquivos desta pasta** para o repositório (*Add file → Upload files*, arrastando as pastas `css`, `js` e `assets` e os arquivos da raiz).
3. **Settings → Pages** → *Source: Deploy from a branch* → branch `main`, pasta `/ (root)` → **Save**. Em alguns minutos, o endereço fica disponível (ex.: `https://raguife.github.io/auditoria-raguife/`).
4. Volte ao Firebase → **Authentication → Configurações → Domínios autorizados** → **Adicionar domínio**: `raguife.github.io` (o domínio do seu Pages).

**Sobre o repositório público:** o GitHub Pages gratuito exige repositório público. Isso expõe só o **código**, não os dados. A chave em `js/config.js` é pública por natureza no Firebase: quem protege os dados são as **regras do Firestore** e o login. Se a empresa preferir repositório privado, é preciso um plano pago do GitHub.

---

## Perfis de acesso

| Perfil | O que faz |
|---|---|
| **Administrador** | Abre e fecha meses, importa bases e listas, cadastra usuários, configura processos, vê tudo |
| **Auditor** | Responde os checklists das áreas liberadas para ele (só enquanto o mês está aberto) |
| **Visualizador** | Consulta checklists e relatórios das áreas liberadas, sem alterar |

Para desligar alguém: *Usuários → Editar → desmarcar "Acesso ativo"*. O login continua existindo no Firebase, mas o sistema bloqueia o acesso.

---

## Rotina mensal

A auditoria do **mês M** analisa a **competência M-1** (ex.: a auditoria de outubro olha setembro).

1. **Exportar do MIX** os dois relatórios de funcionários (sem filtro de data, com histórico):
   - *Funcionários*: Chapa, Nome, Cargo, Faixa Sal., Salário, Depto, Dt. Admissão, Dt. Demissão, Status
   - *Complementar*: Chapa, Nome, CPF, Escala Horário de Trab., CBO, Dt. Nascimento
2. **Painel → Abrir auditoria** → escolher o mês → arrastar os dois arquivos → conferir as populações → **Abrir mês e sortear**.
   - O sistema sorteia na hora os processos que vêm da base (ativos, admitidos, desligados, experiência, menores) e cria os checklists únicos.
3. Ao longo do mês, para cada processo de **lista importada** (férias, consignado, coparticipação, ocorrências disciplinares, planos, retornos de afastamento, mudanças de função): **Importar lista e sortear**. Se não houve casos, use **Sem ocorrências**.
   - A lista pode ser qualquer relatório com a coluna **Chapa**. Ex.: férias = *Relação de Líquidos de Férias* filtrada pelo início do gozo na competência.
4. Auditores marcam **Conforme / Não conforme / Não se aplica**. "Não conforme" exige **observação** e **plano de ação**.
5. **Fechar mês** → gera o **relatório final** (botão *Imprimir / salvar PDF*) para arquivamento.

### Como o sorteio é comprovável
- Cada mês tem um **código de sorteio**. Com a mesma base e o mesmo código, o resultado é sempre igual.
- Cada população tem uma **impressão** (SHA-256 das Chapas), que prova que a lista usada não foi alterada depois.
- Os dois aparecem no relatório.

### Privacidade (LGPD)
- CPF, salário, data de nascimento e dados bancários são lidos **só no navegador** e **não são gravados** no Firebase.
- Fica gravado: Chapa, nome, cargo, departamento, datas de admissão/desligamento e escala das pessoas ativas na competência, além das respostas.
- No Ambulatório, registre na observação **apenas a conformidade do documento**, nunca diagnóstico ou dado clínico.

---

## Ajustes

- **Configurações** (administrador): % da amostra, mínimo de pessoas, fonte da população e itens do checklist de cada processo. As mudanças valem para os meses abertos depois disso.
- **Tamanhos padrão:** ativos 2% (mín. 3) · admitidos/listas 20% (mín. 2–3) · desligados 25% (mín. 3). Com a base de setembro/2026, isso dá cerca de 590 itens por mês. Ajuste se ficar pesado.

## Estrutura dos arquivos

```
index.html            página única
css/app.css           identidade visual Raguife
js/config.js          ← dados do Firebase (preencher)
js/app.js             telas
js/data.js            acesso ao Firebase / modo demonstração
js/processos.js       catálogo padrão de processos e checklists
js/importar.js        leitura dos relatórios do MIX
js/sorteio.js         sorteio reprodutível e populações
js/vendor/xlsx...     leitor de Excel (SheetJS)
assets/               logo e símbolo
firestore.rules       regras de segurança (colar no Firebase)
```

## Observação técnica
O modo demonstração foi testado de ponta a ponta com os relatórios reais do MIX. A conexão com o Firebase segue a documentação oficial (SDK 10.12), mas só pode ser validada no seu projeto. No primeiro uso, teste: login, criação de um auditor, abertura de um mês e uma resposta de checklist com o login do auditor.
