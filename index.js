const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.send('Servidor de intermediario turístico activo');
});

// 🧭 Diccionario avanzado de categorías
const categoriasTurismoLocal = {
  restaurant: [["amenity", "restaurant"]],
  park: [["leisure", "park"]],
  museum: [["tourism", "museum"]],
  attraction: [["tourism", "attraction"]],
  supermarket: [["shop", "supermarket"]],
  fast_food: [["amenity", "fast_food"]],
  library: [["amenity", "library"]],
  peak: [["natural", "peak"]],
  jardin: [["leisure", "garden"]],
  mirador: [
    ["tourism", "viewpoint"],
    ["leisure", "picnic_site"]
  ],
  monumento: [
    ["historic", "monument"],
    ["historic", "memorial"]
  ],
  iglesia: [["amenity", "place_of_worship"]],
  centro_cultural: [
    ["amenity", "arts_centre"],
    ["amenity", "theatre"]
  ],
  ruta_natural: [
    ["route", "hiking"],
    ["route", "foot"],
    ["highway", "path"]
  ],
  lugar_secreto: [
    ["place", "locality"],
    ["place", "isolated_dwelling"],
    ["tourism", "attraction"]
  ]
};

// 🔄 Expansión de categorías (por sinónimos o similares)
const categoriasExtendidas = {
  jardin: ['park', 'common', 'grassland'],
  mirador: ['viewpoint', 'picnic_site'],
  centro_cultural: ['museum', 'theatre'],
  ruta_natural: ['path', 'trail', 'footway', 'forest'],
  supermercado: ['supermarket', 'convenience', 'grocery'],
  iglesia: ['place_of_worship', 'chapel', 'cathedral']
};

app.get('/lugares', async (req, res) => {
  let { categoria, lat, lon } = req.query;
  console.log("🧙 Consulta mágica recibida:", { categoria, lat, lon });

  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ error: 'Latitud o longitud inválidas' });
  }

  const delta = 0.02; // +/- 2 km
  const minLat = latNum - delta;
  const maxLat = latNum + delta;
  const minLon = lonNum - delta;
  const maxLon = lonNum + delta;

  // Preparar lista de categorías base + extendidas (si las hay)
  const categoriasBuscar = [categoria, ...(categoriasExtendidas[categoria] || [])];

  let lugaresTotales = [];

  for (const cat of categoriasBuscar) {
    const filtros = (categoriasTurismoLocal[cat] || [[cat.split('=')[0], cat.split('=')[1]]])
      .map(([clave, valor]) => `
        node[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
        way[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
        relation[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
      `)
      .join('\n');

    const query = `
      [out:json][timeout:25];
      (
        ${filtros}
      );
      out center tags;
    `;

    console.log(`📜 Consulta Overpass para ${cat}:`, query);

    try {
      const response = await axios.get('https://overpass-api.de/api/interpreter', {
        params: { data: query }
      });

      const elementos = response.data.elements || [];
      const lugares = elementos
        .filter(el => el.tags && el.tags.name)
        .map(el => ({
          nombre: el.tags.name,
          categoria: cat,
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
          direccion: el.tags['addr:street'] || '📍 Dirección no disponible',
          telefono: el.tags.phone || '📵 No disponible',
          horario: el.tags.opening_hours || '⏰ No disponible',
          sitioWeb: el.tags.website || '🌐 No disponible',
          descripcion: el.tags.description || '📝 Sin descripción',
        }));

      if (lugares.length > 0) {
        lugaresTotales = lugares;
        break; // ⛳ encontramos algo, no seguimos buscando
      }
    } catch (error) {
      console.error(`❌ Error Overpass en categoría '${cat}':`, error.message);
    }
  }

  console.log('✨ Lugares válidos enviados:', lugaresTotales.length);
  res.json(lugaresTotales);
});

app.listen(PORT, () => {
  console.log(`🌍 Servidor turístico corriendo en http://localhost:${PORT}`);
});
