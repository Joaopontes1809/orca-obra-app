# Orça Obra — redesign responsivo e reposição de funcionalidade

Data: 2026-08-17
Estado: aprovado para planeamento

## 1. Contexto

O Orça Obra é uma aplicação de orçamentos para uma empresa de remodelação em
Portugal. Tem duas páginas e um servidor:

- `public/admin.html` — painel interno, com separadores para pedidos pendentes,
  orçamentos confirmados, agenda, catálogo de serviços e materiais, e
  estatísticas.
- `public/pedido.html` — formulário público que o cliente preenche a partir de
  um link partilhado, com estimativa de valor calculada na hora.
- `server.js` — Express com Postgres, mais duas integrações externas: Google
  Gemini (interpretação de pedidos em texto livre) e SerpApi (pesquisa de preços
  de materiais).

Está publicado no Render:

| Recurso | Valor |
| --- | --- |
| Serviço web | `orca-obra-app-v2`, plano free, região Frankfurt |
| URL | https://orca-obra-app-v2.onrender.com |
| Base de dados | `orca-obra-db`, Postgres 16, plano free |
| Origem do deploy | `github.com/Joaopontes1809/orca-obra-app`, branch `main` |
| Deploy automático | sim, a cada commit em `main` |

O plano free da base de dados expira a 2026-09-12. Não afeta este trabalho, mas
tem de ser renovado ou migrado antes dessa data.

## 2. Problema

O pedido de partida foi visual: a aplicação está desarrumada, o desenho é feio, e
não se adapta a telemóvel, tablet e computador. A investigação ao código
confirmou o problema visual e encontrou funcionalidade partida por baixo.

### 2.1 Problemas de desenho

**Responsividade praticamente inexistente.** Em cerca de 1940 linhas de HTML
existe uma única media query, `@media(min-width:640px){ main{padding-top:24px;} }`.
Todo o conteúdo vive numa coluna de `max-width:760px` centrada. No telemóvel
funciona; no tablet e no computador ficam duas faixas largas de espaço vazio com
uma coluna estreita ao meio.

**CSS duplicado e disperso.** Cada página tem o seu bloco `<style>` com as mesmas
variáveis repetidas, e dezenas de atributos `style="..."` inline espalhados pelo
HTML e pelas template strings de JavaScript. Uma alteração de aspeto obriga a
mexer em dois ficheiros e em vários sítios dentro de cada um.

**Zoom bloqueado.** O `admin.html` declara
`user-scalable=no, maximum-scale=1` no viewport, o que impede o utilizador de
ampliar a página.

### 2.2 Funcionalidade partida

**A agenda não tem backend.** O `admin.html` chama `GET /api/agenda`
(linha 558), `POST /api/agenda` (linha 1334) e `PATCH /api/agenda/:id`
(linha 1330). Nenhuma destas rotas existe no `server.js`, e não existe tabela
`agenda` na base de dados. Verificado em produção: `GET /api/agenda` devolve
HTTP 404.

**A falha da agenda derruba o painel inteiro.** O `loadAll()` faz:

```js
const [cfg, list, ag] = await Promise.all([
  apiGet('/api/config'), apiGet('/api/pedidos'), apiGet('/api/agenda')
]);
```

O `apiGet` lança exceção quando a resposta não é OK. Como o terceiro pedido dá
404, o `Promise.all` rejeita, o `renderAll()` nunca corre, e todos os separadores
ficam vazios — pedidos, catálogo e estatísticas incluídos. O utilizador vê apenas
a mensagem "Erro ao carregar dados".

**Os custos extras nunca são gravados.** O `admin.html` envia `extras` no corpo
do PATCH (linha 913), mas o `server.js` só aceita campos de uma lista fixa
(linha 153) que não inclui `extras`, e a tabela `pedidos` não tem essa coluna. Os
custos adicionais escritos pelo utilizador desaparecem ao recarregar a página.

**Comparação de identificadores da agenda com tipos diferentes.** Em
`openAgendaModal`, `agenda.find(x => x.id === id)` compara o `id` do evento com o
valor lido de `dataset.agenda`, que é sempre texto. Com identificadores numéricos
vindos da base de dados, a comparação estrita nunca encontra o evento.

### 2.3 Fluxos com problemas de utilização

1. Adicionar um custo extra pede três `prompt()` do browser encadeados
   (linhas 881-884), um dos quais exige que o utilizador escreva à mão o valor
   `mao_de_obra_extra`.
2. O nome da empresa é editado através de um `prompt()` (linha 592).
3. Recusar um pedido e excluir um orçamento usam `confirm()` nativo
   (linhas 724 e 893), fora do sistema visual da aplicação.
4. O botão "+ Novo orçamento" cria imediatamente uma linha na base de dados
   através de `POST /api/pedidos/manual` antes de o utilizador escrever seja o que
   for (linhas 1001-1010). Fechar sem preencher deixa um registo vazio.
5. Confirmar um pedido pendente muda de separador e abre um modal por cima, dois
   saltos de contexto seguidos.

### 2.4 Estado do repositório

O que está publicado em produção corresponde a `origin/main`, cujo
`public/admin.html` tem 913 linhas e é byte a byte igual à página servida pelo
Render. Essa versão não tem agenda e funciona.

A pasta de trabalho local é um repositório de git independente: um único commit
(`eb34145`), sem remote configurado, no branch `master`, e sem antepassado comum
com `origin/main`. O `admin.html` local tem 1416 linhas e inclui a agenda partida.
O histórico de `origin/main` são três commits "Add files via upload", ou seja,
carregamentos manuais pela interface web do GitHub.

O repositório local tem ainda o `node_modules` inteiro sob controlo de versões e
não tem `.gitignore`. O `origin/main` não tem `node_modules`.

Existem dois ficheiros por versionar, `public/preview3-admin.html` e
`public/preview3-pedido.html`, que são maquetes antigas com `fetch` simulado.

## 3. Decisões tomadas

| Decisão | Escolha |
| --- | --- |
| Direção visual | Nova, neutra: branco e cinzas frios, sem serifa |
| Cor de acento | Grafite, com cor reservada aos estados |
| Layout em ecrã grande | Menu lateral fixo mais painel de detalhe ao lado |
| Âmbito | Aspeto e revisão de fluxos |
| Ordem de trabalho | Corrigir e publicar primeiro, redesenhar depois |
| Git | Reconciliar com `origin/main`, com aprovação antes de publicar |

A identidade anterior — fundo creme, verde-escuro, serifa itálica Newsreader,
números em IBM Plex Mono — é abandonada.

## 4. Fase 1 — repor funcionalidade

O objetivo desta fase é ter a aplicação a funcionar de verdade em produção,
ainda com o desenho atual. Nenhuma alteração de aspeto entra nesta fase.

### 4.1 Base de dados

Acrescentar em `initDb()`, com guardas de idempotência para correr em segurança
sobre os dados existentes:

```sql
CREATE TABLE IF NOT EXISTS agenda (
  id         SERIAL PRIMARY KEY,
  titulo     TEXT NOT NULL,
  data       DATE NOT NULL,
  tipo       TEXT NOT NULL DEFAULT 'outro',
  pedido_id  INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  nota       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '[]';
```

A chave estrangeira usa `ON DELETE SET NULL` para que apagar um pedido não apague
o evento de agenda associado — o evento perde a ligação mas mantém-se no
calendário.

### 4.2 Rotas da agenda

Quatro rotas novas no `server.js`, no mesmo estilo das existentes (try/catch,
`console.error`, resposta 500 com mensagem em português):

- `GET /api/agenda` — lista todos os eventos, ordenados por data ascendente.
- `POST /api/agenda` — cria um evento. Exige `titulo` e `data`; devolve 400 se
  faltarem.
- `PATCH /api/agenda/:id` — atualiza campos de uma lista de permitidos:
  `titulo`, `data`, `tipo`, `pedidoId`, `nota`.
- `DELETE /api/agenda/:id` — apaga um evento.

Duas questões de contrato que o frontend já assume e têm de ser respeitadas:

- O frontend lê `ev.pedidoId` em camelCase, enquanto a coluna se chama
  `pedido_id`. As leituras devem usar `pedido_id AS "pedidoId"`.
- O frontend trata `ev.data` como texto no formato `YYYY-MM-DD`, tanto no
  `input type="date"` como em `new Date(data + 'T00:00:00')`. Uma coluna `DATE`
  devolvida pelo driver `pg` chega como objeto `Date` e serializa para JSON com
  hora e fuso, o que parte o agrupamento por dia. As leituras devem usar
  `to_char(data, 'YYYY-MM-DD') AS data`.

### 4.3 Persistência dos custos extras

Acrescentar `'extras'` à lista `allowed` em `server.js` linha 153, com o mesmo
tratamento de serialização já aplicado a `itens`:

```js
values.push(key === 'itens' || key === 'extras'
  ? JSON.stringify(req.body[key])
  : req.body[key]);
```

### 4.4 Correções mínimas no frontend

Duas alterações no `admin.html`, sem tocar no aspeto:

**`loadAll()` tolerante a falhas.** Substituir o `Promise.all` por
`Promise.allSettled`, de modo a que cada bloco de dados carregue o que conseguir e
uma rota indisponível não derrube o painel inteiro. As falhas individuais são
comunicadas por toast, nomeando o que falhou, e o `renderAll()` corre sempre.

**Comparação de identificadores.** Em `openAgendaModal` e no listener de
`[data-agenda]`, comparar com `String(x.id) === String(id)`.

### 4.5 Arrumação do repositório

- Criar `.gitignore` com `node_modules/` e `.superpowers/`.
- Remover `node_modules` do controlo de versões com `git rm -r --cached
  node_modules`, que desregista os ficheiros sem os apagar do disco.
- Remover `public/preview3-admin.html` e `public/preview3-pedido.html`, maquetes
  antigas já superadas pelas decisões deste documento.

### 4.6 Reconciliação com o GitHub e publicação

Os históricos são independentes e o de `origin/main` são três carregamentos
manuais sem valor histórico. A abordagem preserva o histórico remoto e acrescenta
commits reais por cima, em vez de o substituir:

1. Criar um branch local a partir de `origin/main`.
2. Colocar nesse branch o conteúdo da pasta de trabalho já corrigido, respeitando
   o `.gitignore` — sem `node_modules`, sem `.superpowers`.
3. Fazer commits com mensagens descritivas, separando a correção do backend da
   arrumação do repositório.
4. Verificar localmente que a aplicação arranca e que as rotas respondem.
5. Pedir aprovação explícita ao utilizador antes do `push`.

Uma consequência que tem de ficar clara: publicar a Fase 1 não repõe apenas
rotas em falta. Substitui também o `public/admin.html` de 913 linhas que está
hoje em produção pela versão local de 1416 linhas — o commit `eb34145`, que
nunca chegou a ser publicado e que traz a agenda, os custos extras, o detalhe
das estatísticas e os modais do catálogo. Em produção isso é visível de
imediato, ainda dentro da identidade visual antiga.

Essa versão nunca correu contra a base de dados real. A verificação local do
passo 4 tem de exercitar os separadores todos, não apenas as rotas novas, e a
lista de critérios da secção 4.7 aplica-se ao conjunto.

O `push` para `main` dispara deploy automático no Render. É uma ação com efeito
externo: não é executada sem confirmação explícita, e a confirmação é pedida
descrevendo o que vai ser enviado.

### 4.7 Critérios de aceitação da Fase 1

- `GET /api/agenda` responde 200 com um array em produção.
- Criar, editar e apagar um evento de agenda persiste após recarregar a página.
- Um custo extra adicionado a um orçamento persiste após recarregar a página.
- Com uma rota de dados indisponível, os restantes separadores continuam a
  mostrar conteúdo.
- `git ls-files` não devolve nada dentro de `node_modules/`.

## 5. Fase 2 — redesign

### 5.1 Estrutura de ficheiros

O CSS sai das páginas para ficheiros próprios, servidos como estáticos pelo
Express, que já serve `public/`. Não é introduzido nenhum passo de build.

```
public/css/tokens.css       variáveis de cor, espaçamento e tipografia
public/css/base.css         reset, tipografia base, controlos de formulário
public/css/components.css   botões, cartões, modais, etiquetas, tabelas
public/css/admin.css        layout do painel
public/css/pedido.css       layout do formulário público
public/js/shared.js         fmt, fmtDate, escapeHtml, uid, apiGet, apiSend
```

`tokens.css`, `base.css` e `components.css` são partilhados pelas duas páginas.
Cada página carrega apenas o seu ficheiro de layout. As funções em `shared.js`
existem hoje duplicadas nas duas páginas com implementações idênticas.

O objetivo desta separação é que uma alteração de aspeto passe a ter um único
sítio onde ser feita. Os atributos `style="..."` inline são eliminados e
substituídos por classes.

### 5.2 Tokens

```css
--bg:#F8FAFC;      --panel:#FFFFFF;   --border:#E2E8F0;
--text:#0F172A;    --dim:#64748B;
--accent:#1E293B;  --accent-soft:#F1F5F9;  --accent-fg:#FFFFFF;
--pend:#C2410C;    --pend-bg:#FFF7ED;
--ok:#15803D;      --ok-bg:#F0FDF4;
--danger:#B91C1C;
```

O acento em grafite é usado em botões primários, item de menu ativo e cabeçalhos.
A cor fica reservada ao significado: laranja para pendente, verde para confirmado,
vermelho para ações destrutivas. Esta separação é deliberada — no desenho atual o
verde da marca e o verde de "confirmado" competem entre si.

Tipografia: Inter em toda a aplicação, sem serifa. As três famílias atuais
(Newsreader, Inter, IBM Plex Mono) passam a uma. Os valores monetários usam
`font-variant-numeric: tabular-nums` para alinhar em coluna, o que dispensa a
fonte monoespaçada.

### 5.3 Layout responsivo

| Largura | Navegação | Lista | Detalhe |
| --- | --- | --- | --- |
| < 768 | separadores no topo | coluna única | modal |
| 768–1023 | separadores no topo | duas colunas | modal |
| ≥ 1024 | menu lateral fixo | duas colunas | modal |
| ≥ 1280 | menu lateral fixo | coluna única estreita | painel à direita |

Acima de 1280 o pedido selecionado abre num painel lateral direito em vez de um
modal, permitindo ver a lista e o orçamento ao mesmo tempo. Abaixo desse valor
mantém-se o modal.

A mesma função de render produz o conteúdo do detalhe nos dois casos; o que muda
é o elemento onde é inserido. Isto evita duas implementações do mesmo ecrã, que
divergiriam com o tempo.

O `user-scalable=no, maximum-scale=1` sai do viewport do `admin.html`.

### 5.4 Revisão de fluxos

Entram sem discussão adicional, por serem substituições diretas de diálogos
nativos do browser por interface própria:

1. **Custo extra** — modal com campo de descrição, campo de valor e select de
   tipo, em vez de três `prompt()` encadeados.
2. **Nome da empresa** — edição inline no cabeçalho, em vez de `prompt()`.
3. **Confirmações destrutivas** — diálogo próprio coerente com o resto da
   aplicação, em vez de `confirm()` nativo. Mantêm-se em recusar pedido e excluir
   orçamento; a natureza irreversível da ação continua a ser comunicada.

Dependem de decisão do utilizador durante a implementação, por alterarem
comportamento e não apenas aspeto:

4. **"+ Novo orçamento" deixa de gravar imediatamente.** O orçamento passa a ser
   criado em memória e só é enviado ao servidor ao guardar. Elimina os registos
   vazios deixados por quem abre e fecha sem preencher. Implica que
   `POST /api/pedidos/manual` passe a receber o orçamento já preenchido.
5. **Confirmar um pedido pendente deixa de mudar de separador.** Em ecrã largo, o
   painel de detalhe à direita passa a mostrar o orçamento confirmado no mesmo
   sítio, sem salto de contexto. Em ecrã estreito o comportamento atual mantém-se,
   por não haver espaço para as duas vistas.

Estes dois pontos são propostos, não assumidos. Cada um é apresentado ao
utilizador antes de ser implementado.

### 5.5 Âmbito visual

Todos os ecrãs das duas páginas são redesenhados: pendentes, confirmados, agenda,
catálogo, estatísticas, os modais de item, serviço, material e custo, os estados
vazios, os estados de erro, e o formulário público do cliente.

### 5.6 Critérios de aceitação da Fase 2

- Nenhum atributo `style="..."` inline nas duas páginas.
- Nenhuma chamada a `prompt()` ou `confirm()` no `admin.html`.
- As duas páginas carregam `tokens.css`, `base.css` e `components.css`.
- Nas larguras 375, 768, 1024 e 1440 não há scroll horizontal e nenhum elemento
  interativo fica cortado ou sobreposto.
- Acima de 1280 o detalhe do pedido aparece em painel lateral, não em modal.
- O zoom do browser funciona nas duas páginas.

## 6. Fora de âmbito

- Autenticação. O painel não tem qualquer controlo de acesso hoje; isso mantém-se
  como está. É um risco conhecido e fica registado para tratamento futuro.
- Alteração do modelo de cálculo de preços e percentagens de mão de obra.
- Alteração das integrações com Gemini e SerpApi, além do aspeto dos seus
  resultados.
- Migração da base de dados para plano pago antes de 2026-09-12.
- Modo escuro.

## 7. Riscos

| Risco | Mitigação |
| --- | --- |
| Publicar a Fase 1 e partir o que está online e funcional | Verificar localmente antes do push; a Fase 1 só acrescenta rotas e colunas, não altera as existentes |
| Reconciliação de git com históricos independentes | Nada é enviado sem aprovação; o histórico remoto é preservado, não substituído |
| Redesign extenso num único passo difícil de rever | A Fase 2 é dividida por ecrã no plano de implementação, com validação a cada bloco |
| Base de dados free expira a 2026-09-12 | Fora de âmbito, mas registado e comunicado |
