const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const opening_hours = require('opening_hours'); // npm install opening_hours

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

// 9. Cache en memoria con TTL de 5 minutos
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// 10. Métricas simples en memoria
const metrics = {
  totalRequests: 0,
  perCategory: {},
};

app.get('/', (req, res) => {
  res.send('Servidor de intermediario activo');
});

app.get('/lugares', async (req, res) => {
  metrics.totalRequests++;
  let { categoria, lat, lon, horario } = req.query;
  console.log("Consulta recibida:", { categoria, lat, lon, horario });

  // Validaciones básicas
  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: '❌ Faltan parámetros: categoria, lat o lon.' });
  }
  try { categoria = decodeURIComponent(categoria); } catch {}
  if (!categoria.includes('=')) {
    return res.status(400).json({ error: '❌ Formato de categoría inválido. Debe ser clave=valor.' });
  }
  const [clave, valor] = categoria.split('=');
  const latNum = parseFloat(lat), lonNum = parseFloat(lon);
  if (!clave || !valor || isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ error: '❌ Parámetros inválidos.' });
  }

  // Actualizar métricas por categoría
  metrics.perCategory[categoria] = (metrics.perCategory[categoria] || 0) + 1;

  // 3. Rango de búsqueda: medio local (~5 km)
  const delta = 0.05;
  const minLat = latNum - delta, maxLat = latNum + delta;
  const minLon = lonNum - delta, maxLon = lonNum + delta;

  // Cache key
  const cacheKey = `${categoria}_${latNum}_${lonNum}_${horario}`;
  if (cache.has(cacheKey)) {
    console.log('💾 Sirviendo desde cache');
    return res.json(cache.get(cacheKey));
  }

  // Construir consulta Overpass
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
    const elementos = response.data.elements || [];

    // 1 y 2. Filtrar por opening_hours + puntuación por etiquetas
    const ahora = new Date();
    const lugares = elementos
      .filter(el => el.tags && el.tags.name)
      .filter(el => {
        if (!el.tags.opening_hours || !horario) return true;
        try {
          const oh = new opening_hours(el.tags.opening_hours);
          // determinar mañana/tarde/noche:
          const hora = ahora.getHours();
          const rango = (horario === 'mañana' && hora < 12)
                     || (horario === 'tarde' && hora >= 12 && hora < 18)
                     || (horario === 'noche' && hora >= 18);
          return rango && oh.getState(); 
        } catch {
          return false;
        }
      })
      .map(el => {
        // 4. Priorizar etiquetas turísticas
        const tourismScore = ['tourism', 'historic', 'leisure'].reduce((sum, k) =>
          sum + (el.tags[k] ? 1 : 0), 0
        );
        // 5. Añadir imagen si existe
        const imagen = el.tags.image || el.tags.wikimedia_commons || null;
        return {
          nombre: el.tags.name,
          categoria,
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
          direccion: el.tags['addr:street'] || 'Dirección no disponible',
          telefono: el.tags.phone || 'No disponible',
          horario: el.tags.opening_hours || 'No disponible',
          sitioWeb: el.tags.website || 'No disponible',
          descripcion: el.tags.description || 'Sin descripción',
          puntuacion: Object.keys(el.tags).length + tourismScore * 2, 
          imagen,
          distancia: null, // explicado en el punto 3
        };
      })
      // 3. (Explicación:) podrías calcular aquí la distancia real con Haversine y usarla en "distancia"
      .sort((a, b) => b.puntuacion - a.puntuacion)
      .slice(0, 4); // limitar a 4 resultados

    // Guardar en cache
    cache.set(cacheKey, lugares);

    console.log('Lugares filtrados y ordenados:', lugares.length);
    res.json(lugares);

  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: '⚠️ Error al obtener datos de Overpass. Intenta más tarde.' });
  }
});

// Endpoint para ver métricas
app.get('/metrics', (req, res) => {
  res.json(metrics);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
