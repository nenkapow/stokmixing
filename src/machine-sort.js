// Compare the displayed machine identifier naturally without changing its stored value.
const collator=new Intl.Collator('id',{numeric:true,sensitivity:'base'});
const identifier=value=>String(value??'').trim().replace(/^mesin\s+/i,'');
export function compareMachineNumbers(a,b){return collator.compare(identifier(a),identifier(b))}
export function sortMachines(machines,numberOf){return [...machines].sort((a,b)=>compareMachineNumbers(numberOf(a),numberOf(b)))}
