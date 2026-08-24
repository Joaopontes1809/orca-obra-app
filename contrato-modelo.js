// RASCUNHO do contrato de empreitada, para ser revisto por um jurista antes
// de ser usado a sério. Não é aconselhamento jurídico: é um ponto de partida
// para não se começar de uma folha em branco.
//
// As cláusulas abaixo tocam em pontos que a lei portuguesa regula — o direito
// de livre resolução em contratos celebrados fora do estabelecimento
// (DL 24/2014), a garantia por defeitos da obra (art. 1225.º do Código Civil),
// e a taxa de IVA aplicável a empreitadas de reabilitação. Os prazos e as
// taxas aqui escritos são os que aparecem com mais frequência, mas a sua
// aplicação depende do caso concreto e tem de ser confirmada.
//
// Os campos entre chavetas são preenchidos automaticamente com os dados do
// orçamento: {{empresa}}, {{cliente}}, {{morada}}, {{telefone}}, {{total}},
// {{material}}, {{maoDeObra}}, {{trabalhos}}, {{data}}.

const CONTRATO_MODELO = {
  titulo: 'Contrato de empreitada',

  intro: `Entre {{empresa}}, adiante designada por Empreiteiro, e {{cliente}}, adiante designado por Dono da Obra, contribuinte n.º ______, é celebrado o presente contrato de empreitada, que se rege pelas cláusulas seguintes.`,

  clausulas: [
    {
      titulo: 'Objeto',
      texto: `O Empreiteiro obriga-se a executar, na morada {{morada}}, os trabalhos discriminados no orçamento anexo, que faz parte integrante deste contrato:

{{trabalhos}}`
    },
    {
      titulo: 'Preço',
      texto: `O preço total dos trabalhos é de {{total}}, assim repartido:
— Materiais: {{material}}
— Mão de obra: {{maoDeObra}}

Os valores indicados não incluem IVA. A taxa aplicável é a que resultar da lei à data da fatura. O Empreiteiro informará o Dono da Obra da taxa aplicada e do respetivo fundamento.`
    },
    {
      titulo: 'Pagamento',
      texto: `O pagamento é efetuado da seguinte forma: ______ % no início dos trabalhos, e o restante na conclusão, contra fatura.

Os pagamentos são registados e o Dono da Obra pode a qualquer momento solicitar o extrato dos valores entregues e em falta.`
    },
    {
      titulo: 'Prazos',
      texto: `Os trabalhos têm início previsto em ______ e a duração estimada de ______ dias úteis.

O prazo suspende-se por facto não imputável ao Empreiteiro, designadamente condições climatéricas que impeçam a execução, falta de acesso ao local, ou alterações solicitadas pelo Dono da Obra.`
    },
    {
      titulo: 'Alterações à obra',
      texto: `Quaisquer trabalhos não previstos no orçamento carecem de acordo prévio quanto ao preço e ao prazo, registado por escrito, incluindo por mensagem escrita entre as partes.

O Empreiteiro não está obrigado a executar trabalhos adicionais sem esse acordo.`
    },
    {
      titulo: 'Materiais',
      texto: `Salvo indicação em contrário, os materiais são fornecidos pelo Empreiteiro e correspondem aos identificados no orçamento.

Se o material escolhido deixar de estar disponível, o Empreiteiro propõe alternativa de qualidade equivalente, sujeita a aceitação do Dono da Obra.`
    },
    {
      titulo: 'Acesso ao local e condições',
      texto: `O Dono da Obra assegura o acesso ao local nos dias e horas acordados, bem como o fornecimento de água e eletricidade necessários à execução.

O Dono da Obra declara que dispõe das autorizações ou licenças exigíveis para os trabalhos contratados, quando aplicável.`
    },
    {
      titulo: 'Receção e garantia',
      texto: `Concluídos os trabalhos, o Dono da Obra procede à sua verificação. Os defeitos aparentes devem ser comunicados no ato ou logo que detetados.

O Empreiteiro responde pelos defeitos da obra nos termos dos artigos 1218.º e seguintes do Código Civil, sendo o prazo de garantia de 5 anos quando aplicável a imóveis destinados a longa duração, nos termos do artigo 1225.º.`
    },
    {
      titulo: 'Direito de livre resolução',
      texto: `Se o presente contrato for celebrado fora do estabelecimento comercial do Empreiteiro, designadamente no domicílio do Dono da Obra, assiste a este o direito de resolver o contrato no prazo de 14 dias, sem necessidade de indicar motivo, nos termos do Decreto-Lei n.º 24/2014, de 14 de fevereiro.

Caso o Dono da Obra solicite expressamente o início dos trabalhos durante esse prazo e venha a exercer o direito de resolução, deverá pagar o valor proporcional aos trabalhos já executados.`
    },
    {
      titulo: 'Resolução',
      texto: `Qualquer das partes pode resolver o contrato em caso de incumprimento grave da outra, mediante comunicação escrita.

Em caso de resolução, são devidos os trabalhos executados e os materiais já adquiridos para a obra.`
    },
    {
      titulo: 'Tratamento de dados',
      texto: `Os dados pessoais recolhidos destinam-se exclusivamente à execução deste contrato e ao cumprimento de obrigações legais, sendo tratados nos termos do Regulamento (UE) 2016/679.

O Dono da Obra pode solicitar o acesso, a retificação ou o apagamento dos seus dados através dos contactos do Empreiteiro.`
    },
    {
      titulo: 'Foro',
      texto: `Para dirimir qualquer litígio emergente do presente contrato é competente o foro da comarca do local da obra, com renúncia a qualquer outro.

O Dono da Obra, na qualidade de consumidor, pode recorrer às entidades de resolução alternativa de litígios de consumo territorialmente competentes.`
    }
  ],

  aceitacao: `O Dono da Obra declara ter lido e compreendido as condições acima, e aceita o orçamento no valor de {{total}}, acrescido de IVA à taxa legal.`
};

module.exports = { CONTRATO_MODELO };
