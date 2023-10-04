# Mini-doc for RAWRESERVE

From Dr. Durove's [tvm.pdf](https://ton.org/tvm.pdf), p.137.

> **RAWRESERVE** ($x$ $y$ -- ), creates an output action which would
> reserve
> exactly $x$ nanograms (if $y=0$), at most $x$ nanograms (if $y=2$), or all
> but $x$ nanograms (if $y=1$ or $y=3$), from the remaining balance of the
> account. It is roughly equivalent to creating an outbound message carrying
> $x$ nanograms (or $b-x$ nanograms, where $b$ is the remaining balance) to
> oneself, so that the subsequent output actions would not be able to spend
> more money than the remainder. Bit $+2$ in $y$ means that the external
> action does not fail if the specified amount cannot be reserved; instead,
> all remaining balance is reserved. Bit $+8$ in $y$ means $x\leftarrow -x$
> before performing any further actions. Bit $+4$ in $y$ means that $x$ is
> increased by the original balance of the current account (before the
> compute phase), including all extra currencies, before performing any
> other checks and actions. Currently $x$ must be a non-negative integer,
> and $y$ must be in the range $0\ldots 15$.

And that's all the documentation we have about TVM instruction
`RAWRESERVE`.

This instruction is sometimes the only way to properly manage incoming and
outgoing amounts of coins. An alternative is to manually count coins using
`my_balance` and `msg_value`. If in comparison with `raw_reserve(x, y)` it
sometimes makes the contract code easier to read, then after replacing the
mysterious numeric `y` (mode) with `reserve::this_amount` or
`reserve::leave_this_amount` everything should change for the better.

This repository mainly provides examples (or explanations in comparison
with real examples) of using this tool.

## Interesting files

-   `contracts/toy.fc` - a contract to run reserve tests on.
-   `test/Toy.spec.ts` - a 'playground' to execute reserves and check what
    will be sent back.
-   `reserve.fc` - the resulting `reserve::` constants func module
    that may be easily used in your contracts.

## Result

Here is a description of the modes for `raw_reserve(x, mode)`.

> "sending a message" here means the contract balance is decreased in
> the way it decreases when sending a message. But no any real message is sent.
> It affects only the other actions (usually actions with send mode 128).

-   `reserve::this_amount = 0` - Equivalent of sending a message with x TONs.
-   `reserve::leave_this_amount = 1` - Equivalent of sending a message with almost whole balance but leaving x TONs, and if not enough - throw error.
-   `reserve::at_most_this_amount = 2` - Equivalent of sending a message with x TONs, and if not enough - don't throw error. but (!) if you will try to send something from it - will throw..
-   `reserve::leave_max_this_amount = 3` - Equivalent of sending a message with almost whole balance but leaving x TONs, and if balance is less than x - do nothing.
-   `reserve::bbalance_plus_this_amount = 4` - Equivalent of sending a message with (balance before msg + x) TONs.
-   `reserve::leave_bbalance_plus_this_amount = 5` - Equivalent of leaving on contract (balance before msg + x) TONs and sending a message with the rest.
-   `reserve::bbalance_minus_this_amount = 12` - Equivalent of sending a message with (balance before msg - x) TONs.
-   `reserve::leave_bbalance_minus_this_amount = 13` - Equivalent of leaving on contract (balance before msg - x) TONs and sending a message with the rest.

## Usage

A ready-to-use file with these constants is [reserve.fc](reserve.fc).
You can import it in your code and use the modes to manage coins:

```
#include "imports/stdlib.fc";
#include "messages.fc";
#include "reserve.fc";

const min_balance = 100000000; ;; 0.1 TON
const to_address = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

() recv_internal(cell in_msg_full, slice in_msg_body) impure {
  raw_reserve(min_balance, reserve::this_amount);
  var msg = begin_cell().store_msg_flag(msg_flag::non_bounceable)
                        .store_slice(to_address)
                        .store_coins(0)
                        .store_msgbody_prefix_slice()
                        .store_op(0)
                        .store_query_id(0)
                        .store_slice("hi")
             .end_cell();
  send_raw_message(msg, mode::CARRY_REMAINING_BALANCE);
  return();
}
```

This small contract will leave `0.1 TON` on the balance and send a message with the remaining TON.

The fancy `messages.fc` file can be found [here](https://github.com/1IxI1/NFT-Bundle/raw/main/contracts/messages.fc).
