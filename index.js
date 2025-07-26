const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Ruta raíz para Render
app.get('/', (req, res) => {
  res.send('Servidor de intermediario activo');
});

app.get('/lugares', async (req, res) => {
  const { categoria, minLat, minLon, maxLat, maxLon } = req.query;

  if (!categoria || !minLat || !minLon || !maxLat || !maxLon) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  const query = `
    [out:json][timeout:25];
    node[${categoria}](${minLat},${minLon},${maxLat},${maxLon});
    out body;
  `;

  const url = 'https://overpass-api.de/api/interpreter';

  try {
    const response = await axios.get(url, { params: { data: query } });

    const lugares = response.data.elements
      .filter(lugar => lugar.tags && lugar.tags.name)
      .map(lugar => ({
        nombre: lugar.tags.name || 'Sin nombre',
        categoria,
        lat: lugar.lat,
        lon: lugar.lon,
        direccion: lugar.tags['addr:street'] || 'Dirección no disponible',
        cocina: lugar.tags.cuisine || 'No especificado',
        telefono: lugar.tags.phone || 'No disponible',
        horario: lugar.tags.opening_hours || 'No disponible',
        sitioWeb: lugar.tags.website || 'No disponible',
        precios: lugar.tags.fee || 'No especificado',
        accesibleSillaRuedas: lugar.tags.wheelchair || 'Desconocido',
        descripcion: lugar.tags.description || 'Sin descripción',
      }));

    const filtrarYPriorizar = (lugares) => {
      const completos = lugares.filter(lugar =>
        lugar.cocina !== 'No especificado' &&
        lugar.horario !== 'No disponible' &&
        (lugar.sitioWeb !== 'No disponible' || lugar.telefono !== 'No disponible')
      );
      const incompletos = lugares.filter(lugar => !completos.includes(lugar));
      return [...completos, ...incompletos];
    };

    res.json(filtrarYPriorizar(lugares));

  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: 'No se pudo obtener datos' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
