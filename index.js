app.get('/lugares', async (req, res) => {
  let { categoria, lat, lon, horario } = req.query;

  // ✅ Nuevo parámetro para accesibilidad
  const { accesibilidad } = req.query;

  const radio = 0.01; // Aprox ~1 km
  const minLat = parseFloat(lat) - radio;
  const maxLat = parseFloat(lat) + radio;
  const minLon = parseFloat(lon) - radio;
  const maxLon = parseFloat(lon) + radio;

  // Mapa de categorías con múltiples etiquetas OSM (ejemplo)
  const categoriasTurismoLocal = {
    restaurant: [
      ["amenity", "restaurant"],
      ["amenity", "cafe"],
      ["amenity", "food_court"],
    ],
    park: [["leisure", "park"]],
    // agrega las demás categorías necesarias aquí
  };

  const filtrosCategorias = categoriasTurismoLocal[categoria];

  // Construcción dinámica de los filtros Overpass
  let filtros = "";
  filtrosCategorias.forEach(([clave, valor]) => {
    filtros += `
      node["${clave}"="${valor}"](${minLat},${minLon},${maxLat},${maxLon});
      way["${clave}"="${valor}"](${minLat},${minLon},${maxLat},${maxLon});
      relation["${clave}"="${valor}"](${minLat},${minLon},${maxLat},${maxLon});
    `;
  });

  // ✅ Filtro extra para accesibilidad si se solicita
  if (accesibilidad === '1') {
    filtros += `
      node["wheelchair"="yes"](${minLat},${minLon},${maxLat},${maxLon});
      way["wheelchair"="yes"](${minLat},${minLon},${maxLat},${maxLon});
      relation["wheelchair"="yes"](${minLat},${minLon},${maxLat},${maxLon});
    `;
  }

  const query = `
    [out:json][timeout:25];
    (
      ${filtros}
    );
    out center 30;
  `;

  try {
    const response = await axios.post(
      'https://overpass-api.de/api/interpreter',
      query,
      { headers: { 'Content-Type': 'text/plain' } }
    );
    res.json(response.data.elements);
  } catch (error) {
    console.error('Error consultando Overpass:', error.message);
    res.status(500).json({ error: 'Error al consultar lugares turísticos' });
  }
});
