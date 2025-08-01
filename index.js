app.get('/lugares', async (req, res) => {
  metrics.totalRequests++;

  let { categoria, lat, lon, horario, estadoAnimo, gasto } = req.query;
  console.log("Consulta recibida:", { categoria, lat, lon, horario, estadoAnimo, gasto });

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

  metrics.perCategory[categoria] = (metrics.perCategory[categoria] || 0) + 1;

  const delta = 0.05;
  const minLat = latNum - delta, maxLat = latNum + delta;
  const minLon = lonNum - delta, maxLon = lonNum + delta;

  // Cache key con filtro horario para resultados filtrados y sin filtrar
  const cacheKeyHorario = `${categoria}_${latNum}_${lonNum}_${horario || ''}_filtered`;
  const cacheKeyNoHorario = `${categoria}_${latNum}_${lonNum}_nohorario`;

  // Función para filtrar por horario
  function filtrarPorHorario(elementos) {
    const ahora = new Date();
    return elementos.filter(el => {
      if (!el.tags || !el.tags.name) return false;
      if (!horario) return true;
      if (!el.tags.opening_hours) return true;
      try {
        const oh = new opening_hours(el.tags.opening_hours);
        const hora = ahora.getHours();
        const rango = (horario === 'mañana' && hora < 12)
                   || (horario === 'tarde' && hora >= 12 && hora < 18)
                   || (horario === 'noche' && hora >= 18);
        return rango && oh.getState();
      } catch {
        return true;
      }
    });
  }

  try {
    let lugares = null;
    let filtradoPorHorario = false;

    // Intentar usar cache con filtro horario
    if (cache.has(cacheKeyHorario)) {
      console.log('💾 Sirviendo desde cache (filtrado horario)');
      lugares = cache.get(cacheKeyHorario);
      filtradoPorHorario = true;
    } else if (cache.has(cacheKeyNoHorario)) {
      console.log('💾 Sirviendo desde cache (sin filtro horario)');
      lugares = cache.get(cacheKeyNoHorario);
      filtradoPorHorario = false;
    } else {
      // No hay cache, hacemos consulta Overpass
      const query = `
        [out:json][timeout:25];
        (
          node[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
          way[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
          relation[${clave}=${valor}](${minLat},${minLon},${maxLat},${maxLon});
        );
        out center tags;
      `;
      const response = await axios.get('https://overpass-api.de/api/interpreter', {
        params: { data: query }
      });
      const elementos = response.data.elements || [];

      // Primer intento: filtrar por horario
      let filtrados = filtrarPorHorario(elementos);

      if (filtrados.length === 0 && horario) {
        // No hay resultados filtrados, relajar filtro y usar todos
        filtrados = elementos.filter(el => el.tags && el.tags.name);
        filtradoPorHorario = false;
      } else {
        filtradoPorHorario = true;
      }

      lugares = filtrados.map(el => {
        const tourismScore = ['tourism', 'historic', 'leisure'].reduce((sum, k) =>
          sum + (el.tags[k] ? 1 : 0), 0
        );
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
          distancia: null,
        };
      }).sort((a, b) => b.puntuacion - a.puntuacion);

      // Guardar en cache el resultado apropiado
      if (filtradoPorHorario) {
        cache.set(cacheKeyHorario, lugares.slice(0, 4));
      } else {
        cache.set(cacheKeyNoHorario, lugares.slice(0, 4));
      }

      lugares = lugares.slice(0, 4);
    }

    res.json({ lugares, filtradoPorHorario });

  } catch (error) {
    console.error('Error Overpass:', error.message);
    res.status(500).json({ error: '⚠️ Error al obtener datos de Overpass. Intenta más tarde.' });
  }
});
