const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.send('Servidor de intermediario turístico activo');
});

// 🧭 Diccionario avanzado de categorías turísticas (clave simple: lista de [clave, valor])
const categoriasTurismoLocal = {
  restaurant: [["amenity", "restaurant"]],
  park: [["leisure", "park"]],
  museum: [["tourism", "museum"]],
  attraction: [["tourism", "attraction"]],
  supermarket: [["shop", "supermarket"]],
  fast_food: [["amenity", "fast_food"]],
  library: [["amenity", "library"]],
  peak: [["natural", "peak"]],
  jardin: [
    ["leisure", "garden"],
    ["leisure", "park"],
    ["leisure", "common"],
    ["natural", "grassland"]
  ],
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

// 🔁 Función para intentar con diferentes radios
async function buscarLugares(categoria, latNum, lonNum, radiosKm) {
  for (const delta of radiosKm) {
    const minLat = latNum - delta;
    const maxLat = latNum + delta;
    const minLon = lonNum - delta;
    const maxLon = lonNum + delta;

    const filtros = categoriasTurismoLocal[categoria]
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

    console.log(`📡 Buscando con delta = ${delta}...`);

    try {
      const response = await axios.get('https://overpass-api.de/api/interpreter', {
        params: { data: query }
      });

      const elementos = response.data.elements || [];

      const lugares = elementos
        .filter(el => el.tags && el.tags.name)
        .map(el => ({
          nombre: el.tags.name,
          categoria,
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
          direccion: el.tags['addr:street'] || '📍 Dirección no disponible',
          telefono: el.tags.phone || '📵 No disponible',
          horario: el.tags.opening_hours || '⏰ No disponible',
          sitioWeb: el.tags.website || '🌐 No disponible',
          descripcion: el.tags.description || '📝 Sin descripción',
        }));

      if (lugares.length > 0) {
        console.log(`✅ Lugares encontrados con delta ${delta}: ${lugares.length}`);
        return lugares;
      } else {
        console.log(`⚠️ Sin resultados con delta ${delta}`);
      }
    } catch (error) {
      console.error(`🔥 Error con delta ${delta}:`, error.message);
      return null;
    }
  }

  return []; // Si ninguno funcionó
}

app.get('/lugares', async (req, res) => {
  let { categoria, lat, lon } = req.query;
  console.log("🧙 Consulta mágica recibida:", { categoria, lat, lon });

  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  if (!categoriasTurismoLocal[categoria]) {
    return res.status(400).json({ error: `Categoría '${categoria}' no reconocida.` });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ error: 'Latitud o longitud inválidas' });
  }

  const radiosKm = [0.02, 0.05, 0.1]; // 🔁 Escala progresiva (2km → 5km → 10km)
  const lugares = await buscarLugares(categoria, latNum, lonNum, radiosKm);

  if (lugares === null) {
    return res.status(500).json({ error: 'Error al consultar Overpass' });
  }

  console.log('✨ Lugares enviados al frontend:', lugares.length);
  res.json(lugares);
});

app.listen(PORT, () => {
  console.log(`🌍 Servidor turístico corriendo en http://localhost:${PORT}`);
});
