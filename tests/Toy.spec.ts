import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, fromNano, SendMode, toNano } from 'ton-core';
import { Toy } from '../wrappers/Toy';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

export abstract class Reserve {
    // equivalent of sending a message with x TONs
    static readonly this_amount = 0;
    // equivalent of sending a message with almost whole balance but leaving x TONs, and if not enough - throw error
    static readonly leave_this_amount = 1;
    // equivalent of sending a message with x TONs, and if not enough - don't throw error. but (!) if you will try to send something from it - will throw.
    static readonly at_most_this_amount = 2;
    // equivalent of sending a message with almost whole balance but leaving x TONs, and if balance is less than x - do nothing
    static readonly leave_max_this_amount = 3;
    // equivalent of sending a message with (balance before msg + x) TONs
    static readonly bbalance_plus_this_amount = 4;
    // equivalent of leaving on contract (balance before msg + x) TONs and sending a message with the rest
    static readonly leave_bbalance_plus_this_amount = 5;
    // equivalent of sending a message with (balance before msg - x) TONs
    static readonly bbalance_minus_this_amount = 12;
    // equivalent of leaving on contract (balance before msg - x) TONs and sending a message with the rest
    static readonly leave_bbalance_minus_this_amount = 13;

    // 4->6, 5->7, 8->10, 9->11, 12->14, 13->15 - adding 2 to this modes just
    // disable errors in action codes if balance is not enough

    // DONT WORK:
    // adding to balance x TONs
    static readonly add_this_amount = 8;
    // adding to balance (current balance - x) TONs
    static readonly add_balance_minus_this_amount = 9;
}

describe('Toy', () => {
    let code: Cell;

    let blockchain: Blockchain;
    let toy: SandboxContract<Toy>;
    let deployer: SandboxContract<TreasuryContract>;

    beforeAll(async () => {
        code = await compile('Toy');

        blockchain = await Blockchain.create();
        blockchain.now = 100;

        toy = blockchain.openContract(Toy.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await toy.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and toy are ready to use
    });

    it('reserving x TONs', async () => {
        // await blockchain.setVerbosityForAddress(toy.address, { vmLogs: 'vm_logs' });
        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.this_amount,
            toNano('0.9'),
            255, // disable second reserve
            0n, // disable second reserve
            SendMode.CARRY_ALL_REMAINING_BALANCE,
            0n,
            toNano('2')
        );
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            success: true,
            outMessagesCount: 1,
        });
        // we will just check for the toy balance because we
        // know that exactly 1 msg was sent from it
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('0.9'));
        // the balance is not decreased with some paltry amount
        // because we don't change blockchain time
    });

    let topUpComputeFee: bigint;

    it('should topup for 1 TON', async () => {
        await toy.sendDeploy(deployer.getSender(), toNano('0.1'));
        const { balance: balanceA } = await blockchain.getContract(toy.address);
        topUpComputeFee = toNano(1) - balanceA;
        // pay for the previous topup (1st fee) and for this one (2nd fee)
        // - resulting adding one fee to balance
        // - resulting 1 TON
        await toy.sendDeploy(deployer.getSender(), topUpComputeFee * 2n);
        const { balance: balanceB } = await blockchain.getContract(toy.address);
        expect(balanceB).toEqual(toNano('1'));
    });

    async function topUpToy(target: bigint) {
        const { balance } = await blockchain.getContract(toy.address);
        const toAdd = target - balance;
        if (toAdd < 0n) {
            throw new Error(`Target ${fromNano(target)} is less than balance ${fromNano(balance)}`);
        }
        await toy.sendDeploy(deployer.getSender(), toAdd + topUpComputeFee);
        const { balance: balanceB } = await blockchain.getContract(toy.address);
        expect(balanceB).toEqual(target);
    }

    let reserveComputeFee: bigint;
    it('sending a message with almost whole balance but leaving x TONs', async () => {
        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.leave_this_amount,
            toNano('0.5'),
            255, // disable second reserve
            0n, // disable second reserve
            SendMode.CARRY_ALL_REMAINING_BALANCE,
            0n,
            toNano('1')
        );
        // has - 1
        // received - 1
        // on process - 2
        // reserves - (on process - 0.5) = 1.5
        // sends - 0.5
        // leaves - 1.5
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            success: true,
            outMessagesCount: 1,
        });
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toBeLessThanOrEqual(toNano('1.5'));
        expect(balance).toBeGreaterThanOrEqual(toNano('1.5') - topUpComputeFee * 20n);
        reserveComputeFee = toNano('1.5') - balance;
    });

    it('should topup for 1.5 TON', async () => {
        await toy.sendDeploy(deployer.getSender(), reserveComputeFee + topUpComputeFee);
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('1.5'));
    });

    it('sending a message with x TONs, and if not enough - sending with all avaliable coins', async () => {
        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.at_most_this_amount,
            toNano('5'),
            // Reserve.this_amount,
            // toNano("0.2"),
            255,
            0n,
            255,
            0n,
            toNano('1')
        );
        // has - 1.5
        // received - 1
        // on process - 2.5
        // reserves - min(5, on process) = 2.5
        // sends - 0
        // leaves - 2.5
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            success: true,
        });
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('2.5') - reserveComputeFee + 526000n); // 526 gas units not spent on sending
    });

    it('sending a message with almost whole balance but leaving x TONs, and if balance is less than x - do nothing', async () => {
        await topUpToy(toNano('3'));

        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.leave_max_this_amount,
            toNano('5'),
            255, // disable second reserve
            0n, // disable second reserve
            SendMode.CARRY_ALL_REMAINING_BALANCE,
            0n,
            toNano('1')
        );
        // has - 3
        // received - 1
        // on process - 4
        // reserves - floor(on process - 5) = 0
        // sends - 4
        // leaves - 0
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            success: true,
            outMessagesCount: 1,
        });
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('0'));
    });

    it.skip('receiving a message with x TONs', async () => {
        await topUpToy(toNano('1'));
        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.this_amount,
            toNano('0.5'),
            Reserve.add_this_amount,
            toNano('0.3'),
            SendMode.CARRY_ALL_REMAINING_BALANCE,
            0n,
            toNano('1')
        );
        // has - 1
        // received - 1
        // on process - 2
        // reserves - 0.5
        // avaliable to send - 1.5
        // reserve adds - 0.3
        // avaliable to send - 1.8
        // leaves - 0.2
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            success: true,
            outMessagesCount: 1,
        });
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('0.2'));
    });

    it('sending a message with (balance before msg) + x TONs', async () => {
        await topUpToy(toNano('1'));
        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.bbalance_plus_this_amount,
            toNano('0.1'),
            255, // disable second reserve
            0n, // disable second reserve
            SendMode.CARRY_ALL_REMAINING_BALANCE,
            0n,
            toNano('1')
        );
        // has - 1
        // received - 1
        // on process - 2
        // reserves - 1 + 0.1 = 1.1
        // sends - the rest = 0.9
        // leaves - 1.1
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            success: true,
            outMessagesCount: 1,
        });
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('1.1'));
    });

    it('leaving on contract (balance before msg) + x TONs and sending a message with the rest', async () => {
        await topUpToy(toNano('1.5'));
        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.leave_bbalance_plus_this_amount,
            toNano('0.1'),
            255, // disable second reserve
            0n, // disable second reserve
            SendMode.CARRY_ALL_REMAINING_BALANCE,
            0n,
            toNano('1')
        );
        // has - 1.5
        // received - 1
        // on process - 2.5
        // reserves - (on process - balance before msg - 0.1) = 2.5 - 1.5 - 0.1 = 0.9
        // sends - the rest = 1.6
        // leaves - 0.9
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            success: true,
        });
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('0.9') - reserveComputeFee);
    });

    it('sending a message with (balance before msg - x) TONs', async () => {
        await topUpToy(toNano('1.5'));
        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.bbalance_minus_this_amount,
            toNano('0.2'),
            255, // disable second reserve
            0n, // disable second reserve
            SendMode.CARRY_ALL_REMAINING_BALANCE,
            0n,
            toNano('1')
        );
        // has - 1.5
        // received - 1
        // on process - 2.5
        // reserve - (balance before msg - 0.2) = 1.5 - 0.2 = 1.3
        // sends - the rest = 1.2
        // leaves - 1.3
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
            success: true,
        });
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('1.3'));
    });

    it('should try questionable reserve 13', async () => {
        await topUpToy(toNano('1.5'));
        const result = await toy.sendTestReserve(
            deployer.getSender(),
            Reserve.leave_bbalance_minus_this_amount,
            toNano('0.2'),
            255, // disable second reserve
            0n, // disable second reserve
            SendMode.CARRY_ALL_REMAINING_BALANCE,
            0n,
            toNano('1')
        );
        // has - 1.5
        // received - 1
        // on process - 2.5
        // reserve - (on process - has + x) = 2.5 - 1.5 + 0.2 = 1.2
        // sends - the rest = 1.3
        // leaves - 1.2
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: toy.address,
        });
        const { balance } = await blockchain.getContract(toy.address);
        expect(balance).toEqual(toNano('1.2') - reserveComputeFee);
    });
});
