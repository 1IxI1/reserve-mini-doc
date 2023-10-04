import { toNano } from 'ton-core';
import { Toy } from '../wrappers/Toy';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const toy = provider.open(Toy.createFromConfig({}, await compile('Toy')));

    await toy.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(toy.address);

    // run methods on `toy`
}
