export class Command{
  constructor({data,execute,cooldown=0,botPermissions=[]}){this.data=data;this.execute=execute;this.cooldown=cooldown;this.botPermissions=botPermissions}
}