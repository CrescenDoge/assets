import { ActionInterface, CheckStepInterface } from "../generic/interface";
import {
    checkTradingPair,
    getTradingPairs,
    PairInfo,
    primaryTokenIndex,
    TokenInfo
} from "../generic/subgraph";
import { getChainAllowlistPath } from "../generic/repo-structure";
import { SmartChain } from "../generic/blockchains";
import {
    rebuildTokenlist,
    TokenItem
} from "../generic/tokenlists";
import { readJsonFile } from "../generic/json";
import { toChecksum } from "../generic/eth-address";
import { assetID, logoURI } from "../generic/asset";
import * as config from "../config"

const PrimaryTokens: string[] = ["WBNB", "BNB"];

async function retrievePancakeSwapPairs(): Promise<PairInfo[]> {
    console.log(`Retrieving pairs from PancakeSwap, limit liquidity USD ${config.PancakeSwap_MinLiquidity}  volume ${config.PancakeSwap_MinVol24}  txcount ${config.PancakeSwap_MinTxCount24}`);

    // prepare phase, read allowlist
    const allowlist: string[] = readJsonFile(getChainAllowlistPath(SmartChain)) as string[];

    const pairs = await getTradingPairs(config.PancakeSwap_TradingPairsUrl, config.PancakeSwap_TradingPairsQuery);
    const filtered: PairInfo[] = [];
    pairs.forEach(x => {
        try {
            if (typeof(x) === "object") {
                const pairInfo = x as PairInfo;
                if (pairInfo) {
                    if (checkTradingPair(pairInfo, SmartChain, config.PancakeSwap_MinLiquidity, config.PancakeSwap_MinVol24, config.PancakeSwap_MinTxCount24, allowlist, PrimaryTokens)) {
                        filtered.push(pairInfo);
                    }
                }
            }
        } catch (err) {
            console.log("Exception:", err);
        }
    });

    console.log("Retrieved & filtered", filtered.length, "pairs:");
    filtered.forEach(p => {
        console.log(`pair:  ${p.token0.symbol} -- ${p.token1.symbol} \t USD ${Math.round(p.reserveUSD)} ${Math.round(p.volumeUSD)} ${p.txCount}`);
    });

    return filtered;
}

function tokenInfoFromSubgraphToken(token: TokenInfo): TokenItem {
    const idChecksum = toChecksum(token.id);
    return new TokenItem(
        assetID(20000714, idChecksum),
        "BEP20",
        idChecksum, token.name, token.symbol, parseInt(token.decimals.toString()),
        logoURI(idChecksum, "smartchain", "--"),
        []);
}

// Retrieve trading pairs from PancakeSwap
async function generateTokenlist(): Promise<void> {
    // note: if [] is returned here for some reason, all pairs will be *removed*.  In case of error (e.g. timeout) it should throw
    const tradingPairs = await retrievePancakeSwapPairs();
    // convert
    const pairs2: [TokenItem, TokenItem][] = [];
    tradingPairs.forEach(p => {
        let tokenItem0 = tokenInfoFromSubgraphToken(p.token0);
        let tokenItem1 = tokenInfoFromSubgraphToken(p.token1);
        if (primaryTokenIndex(p, PrimaryTokens) == 2) {
            // reverse
            const tmp = tokenItem1; tokenItem1 = tokenItem0; tokenItem0 = tmp;
        }
        pairs2.push([tokenItem0, tokenItem1]);
    });
    await rebuildTokenlist(SmartChain, pairs2, "Smart Chain");
}

export class SmartchainAction implements ActionInterface {
    getName(): string { return "Binance Smartchain"; }

    getSanityChecks(): CheckStepInterface[] { return []; }

    async update(): Promise<void> {
        await generateTokenlist();
    }
}
