import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Dictionary,
    Sender,
    SendMode,
} from 'ton-core';

export type ToyConfig = {};

export function toyConfigToCell(config: ToyConfig): Cell {
    return beginCell().endCell();
}

export class Toy implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Toy(address);
    }

    static createFromConfig(config: ToyConfig, code: Cell, workchain = 0) {
        const data = toyConfigToCell(config);
        const init = { code, data };
        return new Toy(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });
    }

    // int reserve_mode_1 = ds~load_uint(8);
    // int to_reserve_1 = ds~load_grams();

    // ;; putting reserve_mode_2 to 256 will disable the second reserve
    // int reserve_mode_2 = ds~load_uint(8);
    // int to_reserve_2 = ds~load_grams();

    // int send_mode = ds~load_uint(8);
    // int to_send = ds~load_grams();
    async sendTestReserve(
        provider: ContractProvider,
        via: Sender,
        reserve_mode_1: number,
        to_reserve_1: bigint,
        reserve_mode_2: number,
        to_reserve_2: bigint,
        send_mode: number,
        to_send: bigint,
        value: bigint
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(reserve_mode_1, 8)
                .storeCoins(to_reserve_1)
                .storeUint(reserve_mode_2, 8)
                .storeCoins(to_reserve_2)
                .storeUint(send_mode, 8)
                .storeCoins(to_send)
                .endCell(),
        });
    }
    async getLotteryData(provider: ContractProvider) {
        const { stack } = await provider.get('get_lottery_data', []);
        const drawTime = stack.readBigNumber();
        const ticketPrice = stack.readBigNumber();
        const prizePool = stack.readBigNumber();
        const activeTickets = stack.readBigNumber();
        const coinPrizes = stack.readBigNumber();
        console.log(stack);
        const NFTsDict = Dictionary.loadDirect(Dictionary.Keys.Uint(16), Dictionary.Values.Address(), stack.readCell());
        const NFTAddresses = NFTsDict.values();
        return {
            drawTime,
            ticketPrice,
            prizePool,
            activeTickets,
            coinPrizes,
            NFTAddresses,
        };
    }
}
