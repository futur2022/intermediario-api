// index.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Endpoint para consultar lugares por categoría y coordenadas
app.get('/lugares', async (req, res) => {
  const { categoria, minLat, minLon, maxLat, maxLon } = req.query;

  if (!categoria || !minLat || !minLon || !maxLat || !maxLon) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  const query = `
    [out:json];
    node[${categoria}](${minLat},${minLon},${maxLat},${maxLon});
    out;
  `;

  const url = 'https://overpass-api.de/api/interpreter';

  try {
    const response = await axios.get(url, {
      params: { data: query },
    });

    const lugares = response.data.elements
      .filter(lugar => lugar.tags && lugar.tags.name)
      .slice(0, 3) // Limitamos a 3 lugares
      .map(lugar => ({
        nombre: lugar.tags.name || 'Sin nombre',
        categoria: categoria,
        lat: lugar.lat,
        lon: lugar.lon,
        direccion: lugar.tags['addr:street'] || 'Dirección no disponible',
      }));

    res.json(lugares);
  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: 'No se pudo obtener datos' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
