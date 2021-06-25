var Hashids = require('hashids');
var hashids = new Hashids('*R6h^4&05!!mq84CMrep5E$ro37gyH*v', 8, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789');

const numbers = hashids.decode('4898597R');
console.log(numbers);
