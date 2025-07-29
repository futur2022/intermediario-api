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

  console.log("Consulta recibida:", { categoria, lat, lon });

  if (!categoria || !lat || !lon) {
    console.log('Error: faltan parámetros');
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  try {
    categoria = decodeURIComponent(categoria);
  } catch (e) {
    console.warn('No se pudo decodificar categoría, se usará tal cual');
  }

  console.log("Categoría decodificada:", categoria);

  const [clave, valor] = categoria.split('=');

  if (!clave || !valor) {
    console.log('Error: formato categoría inválido');
    return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
  }

  const delta = 0.05; // 5 km aprox
  const minLat = parseFloat(lat) - delta;
  const maxLat = parseFloat(lat) + delta;
  const minLon = parseFloat(lon) - delta;
  const maxLon = parseFloat(lon) + delta;

  console.log(`Buscando nodos [${clave}=${valor}] en área: (${minLat},${minLon}) a (${maxLat},${maxLon})`);

  const query = `
    [out:json][timeout:25];
    (
      node[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      way[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      relation[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
    );
    out center tags;
  `;

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });

    console.log('Datos recibidos de Overpass:', response.data.elements.length, 'elementos');

    const lugares = response.data.elements
      .filter(el => el.tags && el.tags.name)
      .map(el => ({
        nombre: el.tags.name || 'Sin nombre',
        categoria,
        lat: el.lat || (el.center && el.center.lat) || null,
        lon: el.lon || (el.center && el.center.lon) || null,
        direccion: el.tags['addr:street'] || 'Dirección no disponible',
        telefono: el.tags.phone || 'No disponible',
        horario: el.tags.opening_hours || 'No disponible',
        sitioWeb: el.tags.website || 'No disponible',
        descripcion: el.tags.description || 'Sin descripción',
      }));

    console.log('Lugares filtrados y mapeados:', lugares.length);

    res.json(lugares);
  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
