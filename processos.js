// Catálogo padrão de processos auditados.
// O administrador pode ajustar % de amostra, mínimo, fonte e itens em Configurações.
// Alterações valem para os meses abertos depois da mudança (cada mês guarda uma cópia dos itens).

// Versão do catálogo padrão: ao mudar, configurações salvas com versão anterior são substituídas.
export const VERSAO_CATALOGO = 2;

export const AREAS = [
  { id: 'dp',  nome: 'Departamento Pessoal' },
  { id: 'sst', nome: 'Segurança do Trabalho' },
  { id: 'amb', nome: 'Ambulatório' },
  { id: 'rh',  nome: 'Recursos Humanos' },
];

// Fontes de população (de onde o sorteio sai)
export const FONTES = {
  ativos:      { nome: 'Funcionários ativos na competência', base: true },
  admitidos:   { nome: 'Admitidos na competência', base: true },
  demitidos:   { nome: 'Desligados na competência', base: true },
  experiencia: { nome: 'Vencimento de experiência (45/90 dias) na competência', base: true },
  menores:     { nome: 'Menores de 18 anos e aprendizes ativos', base: true },
  lista:       { nome: 'Lista importada', base: false },
  admitidos_lista: { nome: 'Admitidos na competência + lista importada', base: false },
  unico:       { nome: 'Checklist único do mês (sem sorteio)', base: false },
};

const ASO_MIN = 'Conteúdo mínimo do ASO (nome, CPF, riscos, exames, data, aptidão, médico com CRM e assinatura)';

export const PROCESSOS_PADRAO = [
  // ---------------- DEPARTAMENTO PESSOAL ----------------
  { id: 'ferias', area: 'dp', nome: 'Férias', fonte: 'lista', pct: 20, min: 2,
    lista: 'Relação de Líquidos de Férias (MIX) — início do gozo na competência',
    itens: [
      'Aviso de férias com antecedência mínima de 30 dias e ciência do empregado',
      'Pagamento realizado até 2 dias antes do início do gozo',
      'Período aquisitivo completo e gozo dentro do período concessivo',
      'Início do gozo fora dos 2 dias que antecedem feriado ou DSR',
      'Fracionamento válido (até 3 períodos, um com 14 dias ou mais e os demais com 5 ou mais)',
      'Cálculo correto: remuneração, médias de variáveis e 1/3 constitucional',
      'Abono pecuniário (se houver) solicitado pelo empregado no prazo',
      'Recibo de férias assinado',
    ] },
  { id: 'rescisao', area: 'dp', nome: 'Rescisão', fonte: 'demitidos', pct: 25, min: 3,
    itens: [
      'Pagamento das verbas em até 10 dias do término do contrato',
      'Verbas rescisórias corretas (saldo, aviso proporcional, 13º, férias + 1/3, médias)',
      'FGTS rescisório e multa recolhidos corretamente',
      'ASO demissional realizado ou dispensa válida',
      'Estabilidade provisória verificada (gestante, acidentado, CIPA, CCT)',
      'TRCT e termo de quitação assinados',
      'Descontos rescisórios com base legal e dentro do limite',
      'Evento S-2299 enviado ao eSocial no prazo',
    ] },
  { id: 'pagamento', area: 'dp', nome: 'Adiantamento e pagamento', fonte: 'ativos', pct: 2, min: 3,
    itens: [
      'Adiantamento pago no valor e na data previstos',
      'Salário pago até o 5º dia útil',
      'Horas extras pagas com o percentual da CCT',
      'Reflexo de horas extras e adicionais no DSR',
      'Adicional noturno com hora reduzida (quando aplicável)',
      'Descontos com base legal ou autorização do empregado',
      'Holerite disponibilizado ao empregado',
    ] },
  { id: 'ponto', area: 'dp', nome: 'Pendências de ponto', fonte: 'ativos', pct: 2, min: 3,
    itens: [
      'Ocorrências de ponto do mês com justificativa do gestor',
      'Ajustes manuais com motivo registrado e ciência do empregado',
      'Horas extras registradas foram pagas ou compensadas',
      'Intervalo intrajornada mínimo respeitado',
      'Interjornada de 11 horas respeitada',
      'DSR concedido (no máximo 6 dias consecutivos de trabalho)',
      'Horas extras dentro do limite de 2 horas diárias',
      'Espelho de ponto com ciência do empregado',
    ] },
  { id: 'consignado', area: 'dp', nome: 'Crédito do Trabalhador (consignado)', fonte: 'lista', pct: 20, min: 2,
    lista: 'Arquivo do Crédito do Trabalhador da competência (portal eSocial/consignado)',
    itens: [
      'Valor descontado em folha igual à soma das parcelas do arquivo',
      'Todos os contratos do arquivo foram lançados na folha',
      'Margem consignável de até 35% respeitada',
      'Desligado com contrato ativo: desconto na rescisão dentro do limite e comunicação ao banco',
      'Repasse à instituição financeira no prazo',
    ] },
  { id: 'coparticipacao', area: 'dp', nome: 'Coparticipação', fonte: 'lista', pct: 20, min: 2,
    lista: 'Fatura da operadora de saúde da competência (eventos de coparticipação)',
    itens: [
      'Coparticipação descontada em folha igual à fatura (titular + dependentes)',
      'Autorização escrita do empregado para o desconto',
      'Desconto dentro do limite previsto na política/contrato do plano',
      'Desligados/cancelados: coparticipação residual descontada na rescisão ou cobrada',
    ] },
  { id: 'planos', area: 'dp', nome: 'Planos de saúde e odontológico (dependentes)', fonte: 'lista', pct: 20, min: 2,
    lista: 'Fatura do plano de saúde + boletos do plano odontológico (selecione todos os arquivos juntos)',
    itens: [
      'Mensalidade (CPP) dos dependentes descontada do titular igual à fatura',
      'Titular sem desconto indevido da própria mensalidade (custeada pela empresa)',
      'Desconto do plano odontológico dos dependentes igual à fatura (se houver)',
      'Dependentes elegíveis (idade e vínculo comprovados)',
      'Inclusão/exclusão de dependentes autorizada pelo titular',
      'Autorização de desconto assinada',
    ] },
  { id: 'conciliacao', area: 'dp', nome: 'Conciliação folha × eSocial × FGTS Digital × DCTFWeb', fonte: 'unico', pct: 0, min: 0,
    itens: [
      'Base de INSS da folha igual aos totalizadores do eSocial',
      'Base de FGTS da folha igual ao FGTS Digital',
      'Base de IRRF da folha igual aos totalizadores do eSocial',
      'Guia do FGTS Digital emitida e paga até o dia 20',
      'DCTFWeb transmitida e DARF pago no prazo',
      'Fechamento da folha (S-1299) sem pendências',
      'FGTS rescisório dos desligados do mês recolhido',
    ] },
  { id: 'adicionais', area: 'dp', nome: 'Insalubridade e periculosidade', fonte: 'ativos', pct: 2, min: 3,
    itens: [
      'Exposição da função/setor verificada no LTCAT/PGR',
      'Recebe o adicional devido (ou não recebe, se não exposto)',
      'Grau e base de cálculo conforme LTCAT e CCT',
      'Sem acúmulo de insalubridade e periculosidade',
      'Evento S-2240 coerente com o LTCAT',
    ] },
  { id: 'salario', area: 'dp', nome: 'Salário × cargo × faixa', fonte: 'ativos', pct: 2, min: 3,
    itens: [
      'Salário não inferior ao piso da CCT',
      'Faixa salarial cadastrada',
      'Salário dentro da faixa do cargo',
      'Reajuste da CCT aplicado',
      'Sem diferença salarial injustificada para a mesma função (equiparação)',
      'Cargo/CBO registrado igual à função exercida',
    ] },
  { id: 'menores', area: 'dp', nome: 'Menores e aprendizes', fonte: 'menores', pct: 25, min: 2,
    itens: [
      'Jornada compatível (aprendiz até 6h/dia; até 8h só com fundamental concluído, incluindo a teoria)',
      'Atividade/setor fora da Lista TIP e sem exposição insalubre ou perigosa',
      'Sem trabalho noturno nem horas extras',
      'Contrato de aprendizagem/estágio e vínculo com a instituição vigentes',
      'Frequência no curso/escola acompanhada',
    ] },

  // ---------------- SEGURANÇA DO TRABALHO ----------------
  { id: 'treinamentos', area: 'sst', nome: 'Treinamentos / NRs', fonte: 'ativos', pct: 2, min: 3,
    itens: [
      'Treinamentos obrigatórios realizados antes do início da atividade',
      'Certificado com conteúdo, carga horária, data e instrutor qualificado',
      'Certificado assinado pelo trabalhador',
      'Reciclagens dentro do prazo',
      'Mudança de função gerou novo treinamento (se aplicável)',
    ] },
  { id: 'capacitacao', area: 'sst', nome: 'Capacitação por atividade (matriz)', fonte: 'ativos', pct: 2, min: 3,
    itens: [
      'Função consta na matriz de treinamento',
      'Possui todos os cursos exigidos pela matriz para a função',
      'Autorização formal para a atividade (ex.: cartão de operador de empilhadeira)',
      'Capacitações específicas válidas (NR-10, 11, 12, 13, 20, 33, 35, conforme a função)',
    ] },
  { id: 'epi', area: 'sst', nome: 'EPIs', fonte: 'ativos', pct: 2, min: 3,
    itens: [
      'Ficha de entrega de EPI assinada (ou registro eletrônico)',
      'EPIs entregues compatíveis com o PGR da função',
      'CA dos EPIs entregues dentro da validade',
      'Periodicidade de troca respeitada',
      'Orientação de uso e conservação registrada',
    ] },
  { id: 'os', area: 'sst', nome: 'Ordem de serviço com ciência', fonte: 'admitidos_lista', pct: 100, min: 0, chaveLista: 'mudancas',
    lista: 'Admitidos da competência + Conferência de Alteração de Cargo e de Estrutura (MIX)',
    itens: [
      'Ordem de serviço emitida para a função atual',
      'Ciência/assinatura do trabalhador antes do início na função',
      'Riscos e medidas de prevenção coerentes com o PGR da função/setor',
    ] },
  { id: 'integracao', area: 'sst', nome: 'Integração e informação de riscos', fonte: 'admitidos', pct: 20, min: 3,
    itens: [
      'Integração de segurança realizada antes do início',
      'Registro de integração assinado pelo trabalhador',
      'Informação sobre riscos ocupacionais e medidas de prevenção registrada',
      'Conteúdo e carga horária conforme o procedimento',
    ] },

  // ---------------- AMBULATÓRIO ----------------
  { id: 'aso_adm', area: 'amb', nome: 'ASO admissional', fonte: 'admitidos', pct: 100, min: 0,
    itens: [
      'ASO realizado antes do início das atividades',
      'Exames complementares exigidos pelo PCMSO realizados',
      'Riscos do ASO iguais aos riscos do PGR da função',
      'Resultado: apto',
      ASO_MIN,
      'Evento S-2220 enviado ao eSocial',
    ] },
  { id: 'aso_dem', area: 'amb', nome: 'ASO demissional', fonte: 'demitidos', pct: 100, min: 0,
    itens: [
      'ASO realizado em até 10 dias do término do contrato, ou dispensa válida (último exame há menos de 90 dias)',
      'Exames complementares exigidos realizados',
      ASO_MIN,
      'Evento S-2220 enviado ao eSocial',
    ] },
  { id: 'aso_per', area: 'amb', nome: 'ASO periódico (pendências)', fonte: 'lista', pct: 100, min: 0, excluirInativos: true,
    lista: 'Pendências de exames periódicos das empresas (selecione todos os arquivos juntos). Afastados, aposentados por invalidez, licenças e desligados são excluídos automaticamente.',
    itens: [
      'Convocação para o exame registrada',
      'Exame agendado ou realizado',
      'Se o vencimento já passou: justificativa e plano de ação para regularizar',
      'Trabalhador exposto a risco com exame vencido: restrição da atividade avaliada',
      'Após a realização: ASO com conteúdo mínimo e S-2220 enviado',
    ] },
  { id: 'aso_mud', area: 'amb', nome: 'ASO de mudança de risco', fonte: 'lista', pct: 100, min: 0, chaveLista: 'mudancas',
    lista: 'Conferência de Alteração de Cargo e de Estrutura (MIX), selecione os dois arquivos juntos. O motivo "Admissão" é ignorado.',
    itens: [
      'A mudança alterou o risco ocupacional (se não, marcar "Não se aplica" nos demais)',
      'ASO de mudança de risco realizado antes da mudança',
      'Riscos do ASO iguais aos riscos da nova função',
      'OS da nova função emitida',
      ASO_MIN,
    ] },

  // ---------------- RECURSOS HUMANOS ----------------
  { id: 'docs_adm', area: 'rh', nome: 'Documentos admissionais', fonte: 'admitidos', pct: 20, min: 3,
    itens: [
      'Documentos pessoais completos',
      'Contrato de trabalho e de experiência assinados antes do início',
      'ASO admissional arquivado',
      'Acordo de compensação/banco de horas assinado',
      'Autorização de descontos (planos, coparticipação) assinada',
      'Opção de vale-transporte',
      'Ficha de dependentes',
      'Termo LGPD assinado',
      'Recebimento do código de conduta/regulamento interno',
      'Idade mínima e restrições para menores verificadas',
    ] },
  { id: 'cadastro_adm', area: 'rh', nome: 'Cadastro admissional', fonte: 'admitidos', pct: 20, min: 3,
    itens: [
      'Nome, CPF e data de nascimento iguais aos documentos',
      'Cargo/CBO, salário e jornada iguais ao contrato',
      'Data de admissão correta',
      'Evento S-2200 enviado antes do início do trabalho',
      'Dados do eSocial iguais aos do MIX',
    ] },
  { id: 'contato7', area: 'rh', nome: 'Contato inicial (7 dias)', fonte: 'admitidos', pct: 20, min: 3,
    itens: [
      'Contato realizado em até 7 dias da admissão',
      'Registro com data e responsável',
      'Pontos levantados registrados e encaminhados',
    ] },
  { id: 'experiencia', area: 'rh', nome: 'Avaliação de experiência (45/90)', fonte: 'experiencia', pct: 20, min: 3,
    itens: [
      'Avaliação de 45 dias realizada antes do vencimento',
      'Avaliação de 90 dias realizada antes do vencimento',
      'Avaliações assinadas pelo gestor e pelo avaliado',
      'Prorrogação única, com total de até 90 dias',
      'Desligamento na experiência (se houver) até o último dia do contrato',
    ] },
];

export const areaNome = id => (AREAS.find(a => a.id === id) || {}).nome || id;
