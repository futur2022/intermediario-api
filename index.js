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

// Función genérica para validar tags con variantes (ignora mayúsculas, espacios, guiones, subrayados)
function tagTieneValor(tags, clave, valoresValidos) {
  if (!tags || !clave || !valoresValidos) return false;
  const valor = tags[clave];
  if (!valor) return false;
  const valorNormalizado = valor.toString().toLowerCase().replace(/[\s-_]/g, '');
  return valoresValidos.some(v =>
    v.toString().toLowerCase().replace(/[\s-_]/g, '') === valorNormalizado
  );
}

function interpretarPrecio(tags) {
  if (tagTieneValor(tags, 'fee', ['no']) || tagTieneValor(tags, 'price', ['0', 'free'])) {
    return '💸 Entrada gratuita';
  }
  if (tagTieneValor(tags, 'fee', ['yes']) || 
      (tags.price && !['0','free'].includes(String(tags.price).toLowerCase()))) {
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

function construirDireccion(tags) {
  const partes = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'],
    tags['addr:postcode']
  ].filter(Boolean);
  if (partes.length === 0) return 'Información no disponible';
  return partes.join(', ');
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

        const precioInterpretado = interpretarPrecio(tags);

        const nivelComodidad = (tags.indoor === 'yes' || tags.building) ? 'Interior' : 'Exterior';

        const direccionCompleta = construirDireccion(tags);

        let rangoPrecio = valorOInfo(tags.price || tags['price:range'] || tags.fee);
        const valoresNoInformativos = ['yes', 'no', '0', 'free', ''];
        if (valoresNoInformativos.includes(String(rangoPrecio).toLowerCase())) {
          rangoPrecio = 'Información no disponible';
        }

        const lugar = {
          nombre: valorOInfo(tags.name),
          categoria,
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
          direccion: direccionCompleta,
          telefono: valorOInfo(tags.phone || tags['contact:phone']),
          horario: valorOInfo(tags.opening_hours),
          sitioWeb: valorOInfo(tags.website || tags['contact:website']),
          descripcion: valorOInfo(tags.description),
          accesible: tagTieneValor(tags, 'wheelchair', ['yes', 'true', '1']),
          rangoPrecio,
          precioAmigable: precioInterpretado,
          tipoCocina: valorOInfo(tags.cuisine),
          estacionamiento: tagTieneValor(tags, 'parking', ['yes', 'true', '1']),
          wifi: tagTieneValor(tags, 'internet_access', ['wlan', 'wifi', 'yes', 'true', '1']),
          banos: tagTieneValor(tags, 'toilets', ['yes', 'true', '1']),
          banosAccesibles: tagTieneValor(tags, 'toilets:wheelchair', ['yes', 'true', '1']),
          terraza: tagTieneValor(tags, 'outdoor_seating', ['yes', 'true', '1']),
          esFamiliar: tagTieneValor(tags, 'kids', ['yes', 'true', '1']),
          mascotasPermitidas: tagTieneValor(tags, 'pets', ['yes', 'true', '1']) || tagTieneValor(tags, 'dog', ['yes', 'true', '1']),
          romantico: tagTieneValor(tags, 'romantic', ['yes', 'true', '1']) || tagTieneValor(tags, 'view', ['yes', 'true', '1']),
          alAireLibre: ['park', 'mirador', 'jardin', 'attraction', 'ruta_natural', 'peak'].includes(categoria),
          cubierto: ['restaurant', 'museum', 'library', 'supermarket'].includes(categoria),
          idealParaFoto: tags.tourism === 'viewpoint' || tags.artwork_type !== undefined,
          tieneWiFi: tagTieneValor(tags, 'internet_access', ['wlan', 'wifi', 'yes', 'true', '1']),
          reservaNecesaria: tagTieneValor(tags, 'reservation', ['yes', 'true', '1']),
          culturaLocal: ['museum', 'monumento', 'centro_cultural'].includes(categoria),
          nivelComodidad,
          smokingPermitido: tagTieneValor(tags, 'smoking', ['yes', 'true', '1']),
          cambioBebe: tagTieneValor(tags, 'baby_changing', ['yes', 'true', '1']),
          aguaPotable: tagTieneValor(tags, 'drinking_water', ['yes', 'true', '1']),
          cercaDeMontanas: ['peak', 'natural'].includes(categoria),
          cercaDeLagos: tags['natural'] === 'water' || tags['water'] === 'lake' || tags['waterway'] === 'river',
          cercaDeParques: ['park', 'jardin', 'leisure'].includes(categoria)
        };

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
        if (
          horario && 
          lugar.horario !== 'Información no disponible' &&
          lugar.horario.toLowerCase().includes(String(horario).toLowerCase())
        ) puntaje += 3;

        lugar.puntaje = puntaje;

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

    lugares.sort((a, b) => b.puntaje - a.puntaje);

    res.json(lugares);
  } catch (error) {
    console.error('🔥 Error Overpass:', error?.message || error);
    res.status(500).json({ error: 'Error al obtener datos de Overpass' });
  }
});

app.listen(PORT, () => {
  console.log(`🌍 Servidor turístico corriendo en http://localhost:${PORT}`);
});
