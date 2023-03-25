import * as ed from '@noble/ed25519';

async function main() {
  const privateKey = Uint8Array.from(
    Buffer.from(
      'e918506d92dfce0ebb16b3acebd005da6552f5ccf72a08c75979632ce6a020a3',
      'hex',
    ),
  );
  const sig = await ed.sign(Buffer.from('I am an honest peer.'), privateKey);
  console.log(Buffer.from(sig).toString('hex'));
}

main();
