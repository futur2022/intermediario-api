const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.send('Servidor de intermediario activo');
});

app.get('/lugares', async (req, res) => {
  let { categoria, lat, lon, horario, estadoAnimo, gasto } = req.query;
  console.log("Consulta recibida:", { categoria, lat, lon, horario, estadoAnimo, gasto });

  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  try {
    categoria = decodeURIComponent(categoria);
  } catch {
    console.warn('No se pudo decodificar categoría');
  }

  // Validar formato clave=valor para categoria
  if (!categoria.includes('=')) {
    return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
  }
  const [clave, valor] = categoria.split('=');
  if (!clave || !valor) {
    return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ error: 'Latitud o longitud inválidas' });
  }

  const delta = 0.05; // +/- 5 km (término medio)
  const minLat = latNum - delta;
  const maxLat = latNum + delta;
  const minLon = lonNum - delta;
  const maxLon = lonNum + delta;

  const query = `
    [out:json][timeout:25];
    (
      node[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      way[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      relation[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
    );
    out center tags;
  `;
  console.log("Consulta Overpass:", query);

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });
    const elementos = response.data.elements || [];
    console.log('Elementos recibidos:', elementos.length);

    const lugares = elementos
      .filter(el => el.tags && el.tags.name)
      .map(el => ({
        nombre: el.tags.name,
        categoria,
        lat: el.lat ?? el.center?.lat,
        lon: el.lon ?? el.center?.lon,
        direccion: el.tags['addr:street'] || 'Dirección no disponible',
        telefono: el.tags.phone || 'No disponible',
        horario: el.tags.opening_hours || 'No disponible',
        sitioWeb: el.tags.website || 'No disponible',
        descripcion: el.tags.description || 'Sin descripción',
        puntuacion: Object.keys(el.tags).length // cantidad de etiquetas como puntuación
      }))
      .sort((a, b) => b.puntuacion - a.puntuacion); // orden descendente por puntuación

    console.log('Lugares filtrados y ordenados:', lugares.length);
    res.json(lugares);
  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
