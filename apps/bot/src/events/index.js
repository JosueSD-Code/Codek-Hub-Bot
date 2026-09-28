import { register as registerReady } from './ready.js';
import { register as registerGuildCreate } from './guildCreate.js';
import { register as registerMessageCreate } from './messageCreate.js';
import { register as registerMessageDelete } from './messageDelete.js';
import { register as registerMessageUpdate } from './messageUpdate.js';
import { register as registerGuildMemberAdd } from './guildMemberAdd.js';
import { register as registerGuildMemberRemove } from './guildMemberRemove.js';
import { register as registerGuildMemberUpdate } from './guildMemberUpdate.js';
import { register as registerGuildBanAdd } from './guildBanAdd.js';
import { register as registerGuildBanRemove } from './guildBanRemove.js';
import { register as registerChannelCreate } from './channelCreate.js';
import { register as registerChannelDelete } from './channelDelete.js';
import { register as registerChannelUpdate } from './channelUpdate.js';
import { register as registerRoleCreate } from './roleCreate.js';
import { register as registerRoleDelete } from './roleDelete.js';

const registrations=[
  registerReady,
  registerGuildCreate,
  registerMessageCreate,
  registerMessageDelete,
  registerMessageUpdate,
  registerGuildMemberAdd,
  registerGuildMemberRemove,
  registerGuildMemberUpdate,
  registerGuildBanAdd,
  registerGuildBanRemove,
  registerChannelCreate,
  registerChannelDelete,
  registerChannelUpdate,
  registerRoleCreate,
  registerRoleDelete
];

export function registerEvents(client,deps){
  for(const register of registrations)register(client,deps);
}
