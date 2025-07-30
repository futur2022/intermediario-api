// intermediario.js (Node.js + Express)
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  console.log('[intermediario] GET /  ← health check');
  res.send('Servidor de intermediario activo');
});

app.get('/lugares', async (req, res) => {
  console.log('────────────────────────────────────────');
  console.log('[intermediario] ← Nuevo request /lugares');
  console.log('[intermediario] req.query raw:', req.query);

  let { categoria, lat, lon } = req.query;

  // Loguea tipos y valores crudos
  console.log('[intermediario] categoria (crudo):', categoria, 'type:', typeof categoria);
  console.log('[intermediario] lat, lon (crudo):', lat, lon);

  if (!categoria || !lat || !lon) {
    console.error('[intermediario] ✖ Parámetros faltantes:', 
      { categoriaPresent: !!categoria, latPresent: !!lat, lonPresent: !!lon });
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  // Decodificar y loguear
  try {
    const decoded = decodeURIComponent(categoria);
    console.log('[intermediario] categoria (decodificada):', decoded);
    categoria = decoded;
  } catch (err) {
    console.warn('[intermediario] ⚠ No se pudo decodificar categoría:', err.message);
  }

  // Splitear y loguear
  const parts = categoria.split('=');
  console.log('[intermediario] parts after split:', parts, 'length:', parts.length);

  const clave = parts[0] || null;
  // Si hay más de dos “=”, se unen de nuevo
  const valor = parts.slice(1).join('=') || null;
  console.log('[intermediario] clave:', clave, 'valor:', valor);

  if (!clave || !valor) {
    console.error('[intermediario] ✖ Formato inválido de categoría, expected clave=valor');
    return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
  }

  // Rango geográfico
  const delta = 0.1;
  const minLat = parseFloat(lat) - delta;
  const maxLat = parseFloat(lat) + delta;
  const minLon = parseFloat(lon) - delta;
  const maxLon = parseFloat(lon) + delta;

  // Montar consulta Overpass
  const query = `
    [out:json][timeout:25];
    (
      node[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      way[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      relation[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
    );
    out center tags;
  `;
  console.log('[intermediario] Consulta Overpass:\n', query.trim());

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });
    const elementos = response.data.elements || [];
    console.log('[intermediario] Elementos recibidos de Overpass:', elementos.length);

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

    console.log('[intermediario] Lugares filtrados:', lugares.length);
    console.log('────────────────────────────────────────\n');
    return res.json(lugares);
  } catch (error) {
    console.error('[intermediario] Error Overpass:', error.message);
    return res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
