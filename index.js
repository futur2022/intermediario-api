// intermediario.js (Node.js + Express)
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
  let { categoria, lat, lon } = req.query;
  console.log("[intermediario] Consulta recibida:", { categoria, lat, lon });

  if (!categoria || !lat || !lon) {
    console.log("[intermediario] Error: faltan parámetros categoria, lat o lon");
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  try {
    categoria = decodeURIComponent(categoria);
    console.log("[intermediario] Categoría decodificada:", categoria);
  } catch (error) {
    console.warn("[intermediario] No se pudo decodificar categoría:", error.message);
  }

  const [clave, valor] = categoria.split('=');
  console.log("[intermediario] Clave y valor de categoría:", clave, valor);

  if (!clave || !valor) {
    console.log("[intermediario] Error: categoría debe tener formato clave=valor");
    return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
  }

  const delta = 0.1; // +/- 10 km de rango
  const minLat = parseFloat(lat) - delta;
  const maxLat = parseFloat(lat) + delta;
  const minLon = parseFloat(lon) - delta;
  const maxLon = parseFloat(lon) + delta;

  const query = `
    [out:json][timeout:25];
    (
      node[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      way[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      relation[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
    );
    out center tags;
  `;

  console.log("[intermediario] Consulta Overpass generada:\n", query);

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });

    const elementos = response.data.elements || [];
    console.log("[intermediario] Elementos recibidos de Overpass:", elementos.length);

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
      }));

    console.log("[intermediario] Lugares filtrados y formateados:", lugares.length);
    res.json(lugares);
  } catch (error) {
    console.error("[intermediario] Error al consultar Overpass:", error.message);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
