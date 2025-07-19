import fetch from 'node-fetch';

const API_KEY = '0d25e4e6d1aadca0d34162f48b9b012a';
const LEAGUE_IDS = [1, 2, 3, 4, 5]; // Puedes ajustar los IDs de las ligas

export default async function handler(req, res) {
  const today = new Date().toISOString().split('T')[0];

  try {
    const matches = [];

    for (const leagueId of LEAGUE_IDS) {
      const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}&league=${leagueId}&season=2024`, {
        headers: {
          'x-apisports-key': API_KEY
        }
      });

      const data = await response.json();
      for (const fixture of data.response) {
        const homeId = fixture.teams.home.id;
        const awayId = fixture.teams.away.id;

        const [homeLast, awayLast, h2h] = await Promise.all([
          getLastMatches(homeId, 'home'),
          getLastMatches(awayId, 'away'),
          getH2H(homeId, awayId)
        ]);

        const homeAvg = goalAverage(homeLast);
        const awayAvg = goalAverage(awayLast);
        const totalAvgOk = homeAvg >= 1.0 && awayAvg >= 1.0;

        const h2hFiltered = h2h.slice(0, 5);
        const ganador = countVictories(h2hFiltered, homeId, awayId);
        const goles25 = countOver25(h2hFiltered);
        const ambosMarcan = countBTTS(h2hFiltered);

        const recomendaciones = [];

        if (totalAvgOk && ganador.local >= 4) recomendaciones.push('Gana Local');
        if (totalAvgOk && ganador.visita >= 4) recomendaciones.push('Gana Visita');
        if (totalAvgOk && goles25 >= 4) recomendaciones.push('+2.5 Goles');
        if (totalAvgOk && ambosMarcan >= 4) recomendaciones.push('Ambos Marcan');

        if (recomendaciones.length > 0) {
          matches.push({
            liga: fixture.league.name,
            pais: fixture.league.country,
            hora: fixture.fixture.date,
            equipos: `${fixture.teams.home.name} vs ${fixture.teams.away.name}`,
            promedioLocal: homeAvg.toFixed(2),
            promedioVisita: awayAvg.toFixed(2),
            recomendaciones
          });
        }
      }
    }

    res.status(200).json({ partidos: matches });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al procesar los datos' });
  }
}

async function getLastMatches(teamId, homeOrAway) {
  const response = await fetch(`https://v3.football.api-sports.io/fixtures?team=${teamId}&last=3`, {
    headers: { 'x-apisports-key': API_KEY }
  });
  const data = await response.json();
  return data.response.filter(match => match.teams[homeOrAway === 'home' ? 'home' : 'away'].id === teamId);
}

async function getH2H(homeId, awayId) {
  const response = await fetch(`https://v3.football.api-sports.io/fixtures/headtohead?h2h=${homeId}-${awayId}`, {
    headers: { 'x-apisports-key': API_KEY }
  });
  const data = await response.json();
  return data.response;
}

function goalAverage(matches) {
  const total = matches.reduce((sum, m) => sum + m.goals.for, 0);
  return matches.length > 0 ? total / matches.length : 0;
}

function countVictories(h2h, homeId, awayId) {
  let local = 0, visita = 0;
  h2h.forEach(match => {
    if (match.teams.home.id === homeId && match.teams.home.winner) local++;
    else if (match.teams.away.id === homeId && match.teams.away.winner) visita++;
    else if (match.teams.home.id === awayId && match.teams.home.winner) visita++;
    else if (match.teams.away.id === awayId && match.teams.away.winner) local++;
  });
  return { local, visita };
}

function countOver25(h2h) {
  return h2h.filter(match => (match.goals.home + match.goals.away) > 2.5).length;
}

function countBTTS(h2h) {
  return h2h.filter(match => match.goals.home > 0 && match.goals.away > 0).length;
}