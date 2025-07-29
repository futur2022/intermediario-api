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
  const { categoria, lat, lon } = req.query;

  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  // Decodificamos la categoría para que '=' no esté codificado
  const categoriaDecodificada = decodeURIComponent(categoria);
  const [clave, valor] = categoriaDecodificada.split('=');

  if (!clave || !valor) {
    return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
  }

  const delta = 0.01;
  const minLat = parseFloat(lat) - delta;
  const maxLat = parseFloat(lat) + delta;
  const minLon = parseFloat(lon) - delta;
  const maxLon = parseFloat(lon) + delta;

  const query = `
    [out:json][timeout:25];
    node[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
    out body;
  `;

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });

    const lugares = response.data.elements
      .filter(el => el.tags && el.tags.name)
      .map(el => ({
        nombre: el.tags.name || 'Sin nombre',
        categoria: categoriaDecodificada,
        lat: el.lat,
        lon: el.lon,
        direccion: el.tags['addr:street'] || 'Dirección no disponible',
        telefono: el.tags.phone || 'No disponible',
        horario: el.tags.opening_hours || 'No disponible',
        sitioWeb: el.tags.website || 'No disponible',
        descripcion: el.tags.description || 'Sin descripción',
      }));

    res.json(lugares);
  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
