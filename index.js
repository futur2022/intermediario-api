const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.send('Servidor de intermediario turístico activo');
});

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
  mirador: [["tourism", "viewpoint"], ["leisure", "picnic_site"]],
  monumento: [["historic", "monument"], ["historic", "memorial"]],
  iglesia: [["amenity", "place_of_worship"]],
  centro_cultural: [["amenity", "arts_centre"], ["amenity", "theatre"]],
  ruta_natural: [["route", "hiking"], ["route", "foot"], ["highway", "path"]],
  lugar_secreto: [["place", "locality"], ["place", "isolated_dwelling"], ["tourism", "attraction"]]
};

app.get('/lugares', async (req, res) => {
  let { categoria, lat, lon, horario } = req.query;
  console.log("🧙 Consulta mágica recibida:", { categoria, lat, lon, horario });

  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  if (!categoriasTurismoLocal[categoria]) {
    return res.status(400).json({ error: `Categoría '${categoria}' no reconocida en turismo local.` });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ error: 'Latitud o longitud inválidas' });
  }

  const delta = 0.1;
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

  console.log("📜 Consulta Overpass:", query);

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });

    const elementos = response.data.elements || [];
    console.log('🎯 Elementos recibidos:', elementos.length);

    let lugares = elementos
      .filter(el => el.tags && el.tags.name)
      .map(el => {
        const lugar = {
          nombre: el.tags.name,
          categoria,
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
          direccion: el.tags['addr:street'] || null,
          telefono: el.tags.phone || null,
          horario: el.tags.opening_hours || null,
          sitioWeb: el.tags.website || null,
          descripcion: el.tags.description || null,
        };

        // 🧮 Calcular puntaje
        let puntaje = 0;
        if (lugar.nombre) puntaje += 2;
        if (lugar.telefono) puntaje += 1;
        if (lugar.direccion) puntaje += 1;
        if (lugar.horario) puntaje += 1;
        if (lugar.sitioWeb) puntaje += 1;
        if (lugar.descripcion) puntaje += 1;

        if (horario && lugar.horario && lugar.horario.toLowerCase().includes(horario.toLowerCase())) {
          puntaje += 3;
        }

        return { ...lugar, puntaje };
      });

    // 🧠 Ordenar lugares por puntaje
    lugares.sort((a, b) => b.puntaje - a.puntaje);

    // 🎯 Formatear la salida para el cliente
    const resultado = lugares.map(lugar => ({
      ...lugar,
      direccion: lugar.direccion || '📍 Dirección no disponible',
      telefono: lugar.telefono || '📵 No disponible',
      horario: lugar.horario || '⏰ No disponible',
      sitioWeb: lugar.sitioWeb || '🌐 No disponible',
      descripcion: lugar.descripcion || '📝 Sin descripción',
    }));

    console.log('✨ Lugares válidos enviados:', resultado.length);
    res.json(resultado);
  } catch (error) {
    console.error('🔥 Error Overpass:', error.message);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`🌍 Servidor turístico corriendo en http://localhost:${PORT}`);
});
