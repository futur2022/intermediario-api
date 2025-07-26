const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/lugares', async (req, res) => {
  // Recibimos la categoría y la latitud y longitud centrales
  const { categoria, lat, lon } = req.query;

  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  // Convertir lat/lon a número
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  // Definir un bounding box pequeño alrededor de las coordenadas (ejemplo 0.01 grados ~ 1km)
  const delta = 0.01;
  const minLat = latNum - delta;
  const maxLat = latNum + delta;
  const minLon = lonNum - delta;
  const maxLon = lonNum + delta;

  const query = `
    [out:json][timeout:25];
    node[${categoria}](${minLat},${minLon},${maxLat},${maxLon});
    out body;
  `;

  const url = 'https://overpass-api.de/api/interpreter';

  try {
    const response = await axios.get(url, {
      params: { data: query },
    });

    const lugares = response.data.elements
      .filter(lugar => lugar.tags && lugar.tags.name)
      .map(lugar => ({
        nombre: lugar.tags.name || 'Sin nombre',
        categoria: categoria,
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

    // Filtrar y priorizar
    const filtrarYPriorizar = (lugares) => {
      const completos = lugares.filter(lugar =>
        lugar.cocina !== 'No especificado' &&
        lugar.horario !== 'No disponible' &&
        (lugar.sitioWeb !== 'No disponible' || lugar.telefono !== 'No disponible')
      );
      const incompletos = lugares.filter(lugar => !completos.includes(lugar));
      return [...completos, ...incompletos];
    };

    const lugaresFiltrados = filtrarYPriorizar(lugares);

    res.json(lugaresFiltrados);

  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: 'No se pudo obtener datos' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
