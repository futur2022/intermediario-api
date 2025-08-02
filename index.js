const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.send('Servidor de intermediario turístico activo');
});

// 🧭 Diccionario ultra ampliado de categorías turísticas (clave simple: lista de [clave, valor])
const categoriasTurismoLocal = {
  restaurant: [
    ["amenity", "restaurant"],
    ["amenity", "cafe"],
    ["amenity", "food_court"],
    ["amenity", "bar"],
    ["amenity", "pub"],
    ["amenity", "fast_food"],
    ["cuisine", "mexican"],
    ["cuisine", "italian"],
    ["cuisine", "asian"],
    ["cuisine", "vegetarian"],
  ],

  park: [
    ["leisure", "park"],
    ["leisure", "garden"],
    ["leisure", "nature_reserve"],
    ["leisure", "playground"],
    ["leisure", "picnic_site"],
    ["natural", "wood"],
    ["natural", "scrub"],
  ],

  museum: [
    ["tourism", "museum"],
    ["historic", "museum"],
    ["tourism", "artwork"],
    ["tourism", "gallery"],
  ],

  attraction: [
    ["tourism", "attraction"],
    ["tourism", "theme_park"],
    ["tourism", "zoo"],
    ["tourism", "aquarium"],
    ["historic", "castle"],
    ["historic", "ruins"],
    ["historic", "archaeological_site"],
  ],

  supermarket: [
    ["shop", "supermarket"],
    ["shop", "convenience"],
    ["shop", "greengrocer"],
    ["shop", "bakery"],
    ["shop", "butcher"],
  ],

  fast_food: [
    ["amenity", "fast_food"],
    ["amenity", "food_court"],
    ["amenity", "ice_cream"],
    ["shop", "kiosk"],
  ],

  library: [
    ["amenity", "library"],
    ["amenity", "community_centre"],
    ["amenity", "school"],
  ],

  peak: [
    ["natural", "peak"],
    ["natural", "mountain"],
    ["natural", "volcano"],
    ["natural", "ridge"],
  ],

  mural: [
    ["artwork", "graffiti"],
    ["artwork", "mural"],
  ],

  jardin: [
    ["leisure", "garden"],
    ["historic", "garden"],
    ["leisure", "park"],
  ],

  mirador: [
    ["tourism", "viewpoint"],
    ["leisure", "picnic_site"],
    ["natural", "peak"],
  ],

  monumento: [
    ["historic", "monument"],
    ["historic", "memorial"],
    ["historic", "statue"],
    ["historic", "battlefield"],
    ["historic", "wayside_shrine"],
  ],

  iglesia: [
    ["amenity", "place_of_worship"],
    ["building", "church"],
    ["building", "cathedral"],
    ["building", "chapel"],
    ["religion", "christian"],
    ["religion", "catholic"],
  ],

  centro_cultural: [
    ["amenity", "arts_centre"],
    ["amenity", "theatre"],
    ["amenity", "cinema"],
    ["amenity", "community_centre"],
    ["historic", "theatre"],
  ],

  ruta_natural: [
    ["route", "hiking"],
    ["route", "foot"],
    ["highway", "path"],
    ["route", "cycle"],
    ["route", "walking"],
  ],

  lugar_secreto: [
    ["place", "locality"],
    ["place", "isolated_dwelling"],
    ["tourism", "attraction"],
    ["historic", "ruins"],
    ["natural", "cave_entrance"],
    ["natural", "spring"],
    ["leisure", "garden"],
  ],

  mercado: [
    ["amenity", "marketplace"],
    ["shop", "kiosk"],
    ["shop", "mall"],
    ["shop", "department_store"],
  ],

  evento: [
    ["event", "festival"],
    ["event", "fair"],
    ["event", "concert"],
  ],

  transporte: [
    ["amenity", "bus_station"],
    ["amenity", "taxi"],
    ["amenity", "bicycle_rental"],
    ["public_transport", "station"],
    ["railway", "station"],
  ],

  hotel: [
    ["tourism", "hotel"],
    ["tourism", "motel"],
    ["tourism", "hostel"],
    ["tourism", "guest_house"],
    ["tourism", "apartment"],
  ],

  cafe: [
    ["amenity", "cafe"],
    ["amenity", "coffee_shop"],
  ],

  entretenimiento: [
    ["amenity", "nightclub"],
    ["amenity", "casino"],
    ["amenity", "bowling_alley"],
    ["amenity", "sports_centre"],
  ],

  naturaleza: [
    ["natural", "water"],
    ["natural", "lake"],
    ["natural", "river"],
    ["natural", "forest"],
    ["natural", "wetland"],
  ],

  playa: [
    ["natural", "beach"],
    ["natural", "coastline"],
    ["natural", "sand"],
  ],

  // Nuevas categorías más difíciles o raras para turismo local

  ruinas_arqueologicas: [
    ["historic", "archaeological_site"],
    ["historic", "ruins"],
    ["historic", "fort"],
  ],

  cavernas_y_cuevas: [
    ["natural", "cave_entrance"],
    ["natural", "cave"],
  ],

  arte_publico: [
    ["artwork", "sculpture"],
    ["artwork", "monument"],
    ["artwork", "installation"],
    ["artwork", "mural"],
  ],

  sitios_religiosos_especiales: [
    ["historic", "wayside_shrine"],
    ["amenity", "shrine"],
    ["amenity", "chapel"],
    ["place_of_worship", "mosque"],
    ["place_of_worship", "temple"],
    ["place_of_worship", "synagogue"],
  ],

  espacios_verdes_poco_comunes: [
    ["leisure", "nature_reserve"],
    ["leisure", "protected_area"],
    ["natural", "grassland"],
    ["natural", "heath"],
    ["natural", "wetland"],
  ],

  centros_historicos: [
    ["place", "historic_district"],
    ["place", "village_green"],
    ["historic", "town_gate"],
  ],

  rutas_especiales: [
    ["route", "ski"],
    ["route", "horse"],
    ["route", "canoe"],
    ["route", "trail"],
  ],

  puentes_y_estructuras: [
    ["bridge", "yes"],
    ["man_made", "tower"],
    ["man_made", "lighthouse"],
    ["man_made", "bridge"],
  ],

  patrimonio_indigena: [
    ["heritage", "indigenous_cultural_site"],
    ["historic", "aboriginal_site"],
  ],

  deportes_al_aire_libre: [
    ["leisure", "sports_centre"],
    ["leisure", "stadium"],
    ["leisure", "golf_course"],
    ["leisure", "pitch"],
  ],

  sitios_arqueologicos_subacuaticos: [
    ["natural", "wreck"],
    ["tourism", "underwater_site"],
  ],

  observatorios_y_ciencia: [
    ["man_made", "observatory"],
    ["tourism", "science_centre"],
    ["amenity", "planetarium"],
  ],

  lugares_de_interes_tecnologico: [
    ["man_made", "power_station"],
    ["man_made", "water_tower"],
    ["man_made", "factory"],
    ["man_made", "windmill"],
  ],

  spas_y_balnearios: [
    ["amenity", "spa"],
    ["natural", "spring"],
  ],

  miradores_menos_comunes: [
    ["tourism", "viewpoint"],
    ["natural", "peak"],
    ["natural", "cliff"],
  ],

  sitios_de_pesca: [
    ["leisure", "fishing_area"],
    ["natural", "water"],
    ["waterway", "river"],
  ],
};

app.get('/lugares', async (req, res) => {
  let { categoria, lat, lon } = req.query;
  console.log("🧙 Consulta mágica recibida:", { categoria, lat, lon });

  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
  }

  // Validar que la categoría enviada sea una clave válida simple
  if (!categoriasTurismoLocal[categoria]) {
    return res.status(400).json({ error: `Categoría '${categoria}' no reconocida en turismo local.` });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  if (isNaN(latNum) || isNaN(lonNum)) {
    return res.status(400).json({ error: 'Latitud o longitud inválidas' });
  }

  const delta = 0.1; // +/- 10 km aprox.
  const minLat = latNum - delta;
  const maxLat = latNum + delta;
  const minLon = lonNum - delta;
  const maxLon = lonNum + delta;

  // Construir filtros Overpass para cada par [clave, valor] de la categoría
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

    console.log('✨ Lugares válidos enviados:', lugares.length);
    res.json(lugares);
  } catch (error) {
    console.error('🔥 Error Overpass:', error.message);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`🌍 Servidor turístico corriendo en http://localhost:${PORT}`);
});
