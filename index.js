app.get('/lugares', async (req, res) => {
  let { categoria, lat, lon, horario, estadoAnimo, gasto } = req.query;
  console.log("Consulta recibida:", { categoria, lat, lon, horario, estadoAnimo, gasto });

  if (!categoria || !lat || !lon) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios: categoria, lat o lon' });
  }

  try {
    categoria = decodeURIComponent(categoria);
  } catch {
    console.warn('No se pudo decodificar categoría');
  }

  // Validar solo la categoría que debe tener formato clave=valor
  const [clave, valor] = categoria.split('=');
  if (!clave || !valor) {
    return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
  }

  // Aquí podrías usar horario, estadoAnimo, gasto para filtrar o loguear, 
  // pero si no los usas aún puedes ignorarlos o incluirlos en la respuesta si quieres.

  const delta = 0.1; // +/-10 km
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
  console.log("Consulta Overpass:", query);

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });
    const elementos = response.data.elements || [];
    console.log('Elementos recibidos:', elementos.length);

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
        // Opcional: podrías agregar aquí la info recibida del usuario si quieres
        estadoAnimo,
        gasto,
        horarioUsuario: horario
      }));

    console.log('Lugares filtrados:', lugares.length);
    res.json(lugares);
  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});
