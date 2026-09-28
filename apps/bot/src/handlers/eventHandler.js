export function registerEvents(client,events){for(const event of events){const method=event.once?'once':'on';client[method](event.name,(...args)=>event.execute(...args))}}
