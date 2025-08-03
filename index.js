const URL_INTERMEDIARIO = 'https://intermediario-api-zmpt.onrender.com';

export default async function recomendarLugares(usuario, categoriaSimple, lat, lon) {
  if (!categoriaSimple || !lat || !lon) {
    throw new Error('Faltan o son inválidos los parámetros para la recomendación');
  }

  const params = new URLSearchParams({
    categoria: categoriaSimple,
    lat,
    lon,
    horario: usuario.horario || '',
    estadoAnimo: usuario.estadoAnimo || '',
    gasto: usuario.gasto || '',
  });

  const url = `${URL_INTERMEDIARIO}/lugares?${params.toString()}`;
  console.log("URL de consulta al intermediario:", url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Error del intermediario: ${text}`);
    }
    const data = await response.json();
    console.log("Datos recibidos del intermediario:", data);
    return data;
  } catch (error) {
    console.error('Error al consultar el intermediario:', error.message);
    return [];
  }
}
