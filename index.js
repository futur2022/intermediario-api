const express = require('express');
const axios = require('axios');
const cors = require('cors');
const opening_hours = require('opening_hours'); // npm install opening_hours
const geolib = require('geolib'); // npm install geolib

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Cache simple en memoria para respuestas (clave: JSON.stringify de parámetros)
const cache = new Map();
// Registro de métricas: contador de consultas por categoría
const metricas = {};

app.get('/', (req, res) => {
  res.send('Servidor de intermediario activo');
});

app.get('/lugares', async (req, res) => {
  try {
    let { categoria, lat, lon, horario, estadoAnimo, gasto } = req.query;
    console.log("Consulta recibida:", { categoria, lat, lon, horario, estadoAnimo, gasto });

    if (!categoria || !lat || !lon) {
      return res.status(400).json({ error: 'Faltan parámetros: categoria, lat o lon' });
    }

    try {
      categoria = decodeURIComponent(categoria);
    } catch {
      console.warn('No se pudo decodificar categoría');
    }

    if (!categoria.includes('=')) {
      return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
    }
    const [clave, valor] = categoria.split('=');
    if (!clave || !valor) {
      return res.status(400).json({ error: 'Categoría debe tener formato clave=valor' });
    }

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum)) {
      return res.status(400).json({ error: 'Latitud o longitud inválidas' });
    }

    // Registro métricas
    metricas[categoria] = (metricas[categoria] || 0) + 1;

    // Cache key
    const cacheKey = JSON.stringify({ categoria, lat: latNum, lon: lonNum, horario, estadoAnimo, gasto });
    if (cache.has(cacheKey)) {
      console.log('Respuesta desde cache');
      return res.json(cache.get(cacheKey));
    }

    // Rango ~5km
    const delta = 0.05;
    const minLat = latNum - delta;
    const maxLat = latNum + delta;
    const minLon = lonNum - delta;
    const maxLon = lonNum + delta;

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

    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });
    const elementos = response.data.elements || [];
    console.log('Elementos recibidos:', elementos.length);

    // Hora actual para filtrado horario
    const ahora = new Date();
    // Para interpretar horario seleccionado ("mañana", "tarde", "noche") definimos rangos
    const horariosRango = {
      manana: [6, 12],
      tarde: [12, 18],
      noche: [18, 24]
    };
    const horarioKey = horario?.toLowerCase() || null;
    const horaActual = ahora.getHours();

    // Función para saber si está abierto según opening_hours y horario usuario
    function estaAbierto(openingHoursStr) {
      if (!openingHoursStr) return true; // si no tiene etiqueta, asumimos abierto
      try {
        const oh = new opening_hours(openingHoursStr);
        if (!oh.getState()) return false; // cerrado ahora mismo
        if (!horarioKey || !horariosRango[horarioKey]) return true; // no filtramos por horario

        // Comprobar si la hora actual está dentro del rango horario usuario
        const [inicio, fin] = horariosRango[horarioKey];
        return horaActual >= inicio && horaActual < fin;
      } catch {
        return true; // si hay error en parsing, asumimos abierto
      }
    }

    // Etiquetas turísticas preferidas para ponderar mejor
    const etiquetasTuristicas = [
      'tourism', 'historic', 'leisure', 'amenity', 'attraction'
    ];

    // Procesamos lugares
    let lugares = elementos
      .filter(el => el.tags && el.tags.name)
      .map(el => {
        const dist = geolib.getDistance(
          { latitude: latNum, longitude: lonNum },
          { latitude: el.lat ?? el.center?.lat, longitude: el.lon ?? el.center?.lon }
        );

        // Contamos etiquetas turísticas que tenga
        const turisticCount = etiquetasTuristicas.reduce((acc, key) => {
          return acc + (el.tags[key] ? 1 : 0);
        }, 0);

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
          imagen: el.tags.image || el.tags.photo || el.tags['wikimedia_commons'] || null,
          puntuacion: Object.keys(el.tags).length + turisticCount * 3, // +3 puntos por cada etiqueta turística para ponderar
          distancia: dist, // en metros
          abiertoAhora: estaAbierto(el.tags.opening_hours)
        };
      });

    // Filtrar solo lugares abiertos según horario usuario
    lugares = lugares.filter(l => l.abiertoAhora);

    // Ordenar primero por puntuación (más etiquetas + turísticas) y luego por distancia (más cerca)
    lugares.sort((a, b) => {
      if (b.puntuacion !== a.puntuacion) return b.puntuacion - a.puntuacion;
      return a.distancia - b.distancia;
    });

    // Limitar a 4 resultados para no saturar
    lugares = lugares.slice(0, 4);

    // Si no hay lugares, sugerir mensaje amigable
    if (lugares.length === 0) {
      return res.json({
        mensaje: 'No se encontraron lugares abiertos en la categoría y horario seleccionados. Prueba otro horario o categoría.',
        lugares: []
      });
    }

    // Guardar en cache (por 10 min)
    cache.set(cacheKey, lugares);
    setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000);

    res.json(lugares);
  } catch (error) {
    console.error('Error en /lugares:', error.message);
    res.status(500).json({
      error: 'Error al obtener datos de Overpass o procesar la consulta, intenta de nuevo más tarde.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
