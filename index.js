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

function interpretarPrecio(tags) {
  if (tags.fee === 'no' || tags.price === '0' || tags.price === 'free') {
    return '💸 Entrada gratuita';
  }
  if (tags.fee === 'yes' || (tags.price && tags.price !== '0' && tags.price.toLowerCase() !== 'free')) {
    return '💰 Entrada de pago';
  }
  if (tags['price:range'] || tags.price) {
    return '💵 Costo aproximado';
  }
  return 'Información no disponible';
}

function valorOInfo(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return 'Información no disponible';
  }
  return valor;
}

app.get('/lugares', async (req, res) => {
  const { categoria, lat, lon, horario } = req.query;
  console.log("🧙 Consulta mágica recibida:", { categoria, lat, lon, horario });

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

  try {
    const response = await axios.get('https://overpass-api.de/api/interpreter', {
      params: { data: query }
    });

    const elementos = response.data.elements || [];
    console.log('🎯 Elementos recibidos:', elementos.length);

    const lugares = elementos
      .filter(el => el.tags && el.tags.name)
      .map(el => {
        const tags = el.tags;

        // Interpretar precio en texto amigable
        const precioInterpretado = interpretarPrecio(tags);

        // Nivel de comodidad/clima (inferido)
        let nivelComodidad = 'Exterior';
        if (tags.indoor === 'yes' || tags.building) {
          nivelComodidad = 'Interior';
        }

        const lugar = {
          nombre: valorOInfo(tags.name),
          categoria,
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
          direccion: valorOInfo(tags['addr:street']),
          telefono: valorOInfo(tags.phone),
          horario: valorOInfo(tags.opening_hours),
          sitioWeb: valorOInfo(tags.website),
          descripcion: valorOInfo(tags.description),
          accesible: tags.wheelchair === 'yes',
          rangoPrecio: valorOInfo(tags.price || tags['price:range'] || tags.fee),
          precioAmigable: precioInterpretado,
          tipoCocina: valorOInfo(tags.cuisine),
          estacionamiento: tags.parking === 'yes' || tags['parking:lane'] !== undefined,
          wifi: tags.internet_access === 'wlan' || tags.internet_access === 'yes',
          banos: tags.toilets === 'yes',
          banosAccesibles: tags['toilets:wheelchair'] === 'yes',
          terraza: tags.outdoor_seating === 'yes',
          esFamiliar: tags.kids === 'yes',
          mascotasPermitidas: tags.pets === 'yes' || tags.dog === 'yes',
          romantico: tags.romantic === 'yes' || tags['view'] === 'yes',
          alAireLibre: ['park', 'mirador', 'jardin', 'attraction', 'ruta_natural', 'peak'].includes(categoria),
          cubierto: ['restaurant', 'museum', 'library', 'supermarket'].includes(categoria),
          idealParaFoto: tags.tourism === 'viewpoint' || tags.artwork_type !== undefined,
          tieneWiFi: tags.internet_access === 'wlan',
          reservaNecesaria: tags.reservation === 'yes',
          culturaLocal: ['museum', 'monumento', 'centro_cultural'].includes(categoria),
          nivelComodidad,
          smokingPermitido: tags.smoking === 'yes',
          cambioBebe: tags['baby_changing'] === 'yes',
          aguaPotable: tags.drinking_water === 'yes',
          cercaDeMontanas: ['peak', 'natural'].includes(categoria),
          cercaDeLagos: tags['natural'] === 'water' || tags['water'] === 'lake' || tags['waterway'] === 'river',
          cercaDeParques: ['park', 'jardin', 'leisure'].includes(categoria)
        };

        // 🧮 Calcular puntaje
        let puntaje = 0;
        if (lugar.nombre !== 'Información no disponible') puntaje += 2;
        if (lugar.telefono !== 'Información no disponible') puntaje += 1;
        if (lugar.direccion !== 'Información no disponible') puntaje += 1;
        if (lugar.horario !== 'Información no disponible') puntaje += 1;
        if (lugar.sitioWeb !== 'Información no disponible') puntaje += 1;
        if (lugar.descripcion !== 'Información no disponible') puntaje += 1;
        if (lugar.accesible) puntaje += 1;
        if (lugar.tipoCocina !== 'Información no disponible') puntaje += 1;
        if (lugar.rangoPrecio !== 'Información no disponible') puntaje += 1;
        if (horario && lugar.horario.toLowerCase().includes(horario.toLowerCase())) puntaje += 3;

        lugar.puntaje = puntaje;

        // Etiquetas extra visuales
        lugar.tagsExtras = [];
        if (lugar.wifi) lugar.tagsExtras.push("📶 Wi-Fi");
        if (lugar.estacionamiento) lugar.tagsExtras.push("🚗 Estacionamiento");
        if (lugar.banos) lugar.tagsExtras.push("🚻 Baños");
        if (lugar.banosAccesibles) lugar.tagsExtras.push("♿ Baños accesibles");
        if (lugar.terraza) lugar.tagsExtras.push("🌤️ Terraza");
        if (lugar.accesible) lugar.tagsExtras.push("♿ Accesible");
        if (lugar.tipoCocina !== 'Información no disponible') lugar.tagsExtras.push(`🍽️ ${lugar.tipoCocina}`);
        if (lugar.rangoPrecio !== 'Información no disponible') lugar.tagsExtras.push(`💲 ${lugar.rangoPrecio}`);
        if (lugar.precioAmigable && lugar.precioAmigable !== 'Información no disponible') lugar.tagsExtras.push(lugar.precioAmigable);
        if (lugar.mascotasPermitidas) lugar.tagsExtras.push("🐶 Pet Friendly");
        if (lugar.romantico) lugar.tagsExtras.push("❤️ Romántico");
        if (lugar.smokingPermitido) lugar.tagsExtras.push("🚬 Permite fumar");
        if (lugar.cambioBebe) lugar.tagsExtras.push("👶 Cambiador de bebé");
        if (lugar.aguaPotable) lugar.tagsExtras.push("💧 Agua potable");

        return lugar;
      });

    // Ordenar por puntaje
    lugares.sort((a, b) => b.puntaje - a.puntaje);

    res.json(lugares);
  } catch (error) {
    console.error('🔥 Error Overpass:', error.message);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`🌍 Servidor turístico corriendo en http://localhost:${PORT}`);
});
