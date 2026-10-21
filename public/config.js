// Configuração do site. Editar aqui não exige mexer no código da página.
window.SITE_CONFIG = {
  // Arquivos lidos da MESMA origem (a CDN). Caminho relativo de propósito: o
  // ambiente de teste é outra pasta/bucket, e a página serve aos dois sem mudar.
  timelineUrl: "timeline.json",
  adsUrl: "ads.json",
  // Intervalo entre consultas, em segundos: base + variação aleatória, para
  // milhares de leitores não pedirem no mesmo instante.
  pollBaseSeconds: 20,
  pollJitterSeconds: 10,
  // Para onde vai o "reportar erro". Preencha antes de publicar.
  reportErrorHref: "mailto:contato@exemplo.com?subject=Erro%20em%20checagem",
  reportErrorLabel: "contato@exemplo.com",
  timezone: "America/Sao_Paulo",
};
