export function handleDiscordError(error){
  const codes={
    50013:'No tengo permisos suficientes.',
    50007:'No puedo enviar mensajes a ese usuario.',
    50035:'El mensaje o embed supera los límites de Discord.',
    30037:'Se alcanzó el máximo de canales.',
    30013:'Se alcanzó el máximo de roles.',
    10003:'Canal no encontrado.',
    10011:'Rol no encontrado.',
    10013:'Usuario no encontrado.'
  };
  return codes[error?.code]||('Error de Discord: '+(error?.message||'desconocido'));
}
