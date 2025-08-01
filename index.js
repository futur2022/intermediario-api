const express = require('express');
const cors = require('cors');
const axios = require('axios');
const opening_hours = require('opening_hours');

const app = express();
app.use(cors());

function filtrarPorHorario(elementos, horario) {
  const ahora = new Date();
  return elementos
    .map(el => {
      let motivoExclusion = '';
      if (!el.tags || !el.tags.name) {
        motivoExclusion = 'Sin nombre';
        return { ...el, motivoExclusion };
      }
      if (!horario) return el;

      if (!el.tags.opening_hours) {
        motivoExclusion = 'Sin horario declarado';
        return { ...el, motivoExclusion };
      }

      try {
        const oh = new opening_hours(el.tags.opening_hours);
        const hora = ahora.getHours();
        const rango = (horario === 'mañana' && hora < 12)
                   || (horario === 'tarde' && hora >= 12 && hora < 18)
                   || (horario === 'noche' && hora >= 18);

        if (!rango || !oh.getState()) {
          motivoExclusion = 'Cerrado en este horario';
          return { ...el, motivoExclusion };
        }

        return el;
      } catch {
        motivoExclusion = 'Error parsing horario';
        return { ...el, motivoExclusion };
      }
    })
    .filter(el => !el.motivoExclusion);
}

app.get('/lugares', async (req, res) => {
  const { categoria, lat, lon, horario } = req.query;
  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: '❌ Faltan parámetros requeridos' });
  }

  const delta = 0.02;
  const minLat = parseFloat(lat) - delta;
  const maxLat = parseFloat(lat) + delta;
  const minLon = parseFloat(lon) - delta;
  const maxLon = parseFloat(lon) + delta;

  const query = `
    [out:json][timeout:25];
    (
      node[${categoria}](${minLat},${minLon},${maxLat},${maxLon});
      way[${categoria}](${minLat},${minLon},${maxLat},${maxLon});
    );
    out center tags;
  `;

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });
    const elementos = response.data.elements || [];

    let filtrados = filtrarPorHorario(elementos, horario);
    let filtradoPorHorario = true;

    if (filtrados.length === 0 && horario) {
      filtrados = elementos.filter(el => el.tags && el.tags.name);
      filtradoPorHorario = false;
    }

    const excluidos = elementos.filter(el => el.motivoExclusion);

    const lugares = filtrados.slice(0, 4).map(el => ({
      nombre: el.tags.name,
      lat: el.lat ?? el.center?.lat,
      lon: el.lon ?? el.center?.lon,
      categoria: categoria,
      descripcion: el.tags.description || '',
      imagen: el.tags.image || el.tags.wikimedia_commons || null
    }));

    res.json({
      lugares,
      filtradoPorHorario,
      excluidos: excluidos.map(e => ({
        nombre: e.tags?.name || 'Sin nombre',
        motivo: e.motivoExclusion
      }))
    });
  } catch (error) {
    console.error('❌ Error al consultar Overpass:', error.message);
    res.status(500).json({ error: '⚠️ Error al obtener lugares' });
  }
});

app.get('/camino-secreto', async (req, res) => {
  const { latInicio, lonInicio, latDestino, lonDestino } = req.query;

  if (!latInicio || !lonInicio || !latDestino || !lonDestino) {
    return res.status(400).json({ error: '❌ Faltan coordenadas de origen y destino' });
  }

  const delta = 0.01;
  const minLat = Math.min(latInicio, latDestino) - delta;
  const maxLat = Math.max(latInicio, latDestino) + delta;
  const minLon = Math.min(lonInicio, lonDestino) - delta;
  const maxLon = Math.max(lonInicio, lonDestino) + delta;

  const tagsInteresantes = [
    'tourism=museum', 'tourism=artwork', 'historic=memorial',
    'leisure=garden', 'tourism=viewpoint', 'tourism=attraction',
    'artwork_type=mural', 'artwork_type=sculpture'
  ];

  const filtroTags = tagsInteresantes.map(t => {
    const [clave, valor] = t.split('=');
    return `
      node[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      way[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
    `;
  }).join('\n');

  const query = `
    [out:json][timeout:25];
    (
      ${filtroTags}
    );
    out center tags;
  `;

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });

    const elementos = response.data.elements || [];

    const lugares = elementos
      .filter(el => el.tags && el.tags.name)
      .slice(0, 2)
      .map(el => ({
        nombre: el.tags.name,
        tipo: el.tags.tourism || el.tags.historic || el.tags.leisure || el.tags.artwork_type || 'interesante',
        lat: el.lat ?? el.center?.lat,
        lon: el.lon ?? el.center?.lon,
        descripcion: el.tags.description || 'Sin descripción',
        imagen: el.tags.image || el.tags.wikimedia_commons || null
      }));

    res.json({ secretos: lugares });
  } catch (error) {
    console.error('❌ Error camino-secreto:', error.message);
    res.status(500).json({ error: '⚠️ Error al obtener lugares secretos.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend en puerto ${PORT}`);
});
