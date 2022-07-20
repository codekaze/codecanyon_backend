
var express = require('express');
var router = express.Router();

const stripePublishableKey = 'pk_test_51It2LfEovG5yA4kNRshWoo2vENOoBpGK37WAynWwuxGeaMHQUIuTQ3eyT49SKkBHzB4yb6MqoQj7q60XVQByTC6Z00mVzNL3rp';
const stripeSecretKey = 'sk_test_51It2LfEovG5yA4kNZAnGLpPbHmUKDkiibD3ZmUKMCupPkvkXSga7EO4Rtu7nPsTWshcA9UaIiU0cE3x4veMMlvmM003NNu3XC5';
const stripeWebhookSecret = 'whsec_';

const stripe = require('stripe')(stripeSecretKey);


function getKeys(payment_method) {
    var secret_key = stripeSecretKey;
    var publishable_key = stripePublishableKey;

    switch (payment_method) {
        case 'grabpay':
        case 'fpx':
            publishable_key = process.env.STRIPE_PUBLISHABLE_KEY_MY;
            secret_key = process.env.STRIPE_SECRET_KEY_MY;
            break;
        case 'au_becs_debit':
            publishable_key = process.env.STRIPE_PUBLISHABLE_KEY_AU;
            secret_key = process.env.STRIPE_SECRET_KEY_AU;
            break;
        case 'oxxo':
            publishable_key = process.env.STRIPE_PUBLISHABLE_KEY_MX;
            secret_key = process.env.STRIPE_SECRET_KEY_MX;
            break;
        default:
            publishable_key = process.env.STRIPE_PUBLISHABLE_KEY;
            secret_key = process.env.STRIPE_SECRET_KEY;
    }

    return { secret_key, publishable_key };
}

function generateResponse(intent) {
    switch (intent.status) {
        case 'requires_action':
            // Card requires authentication
            return {
                clientSecret: intent.client_secret,
                requiresAction: true,
                status: intent.status,
            };
        case 'requires_payment_method':
            // Card was not properly authenticated, suggest a new payment method
            return {
                error: 'Your card was denied, please provide a new payment method',
            };
        case 'succeeded':
            // Payment is complete, authentication not required
            // To cancel the payment after capture you will need to issue a Refund (https://stripe.com/docs/api/refunds).
            console.log('💰 Payment received!');
            return {
                client_secret: intent.client_secret,
                status: intent.status,
                payment_intent: intent,
            };
    }

    return {
        error: 'Failed',
    };
}


/* GET users listing. */
router.get('/stripe-key', function (req, res) {
    const { publishable_key } = getKeys(req.query.paymentMethod);
    res.send({ publishableKey: publishable_key });
});

router.post(
    '/pay-without-webhooks',
    async function (req, res) {
        // const {
        //     paymentMethodId,
        //     paymentIntentId,
        //     items,
        //     currency,
        //     useStripeSdk,
        //     cvcToken,
        //     email,
        // }: {
        //     paymentMethodId?: string;
        //     paymentIntentId?: string;
        //     cvcToken?: string;
        //     items: Order;
        //     currency: string;
        //     useStripeSdk: boolean;
        //     email?: string;
        // } = req.body;
        var useStripeSdk = req.body.useStripeSdk;
        var paymentMethodId = req.body.paymentMethodId;
        var paymentIntentId = req.body.paymentIntentId;
        var currency = req.body.currency;
        var email = req.body.email;
        var cvcToken = req.body.cvcToken;
        var items = req.body.items;


        //this should from databases
        var orderAmount = 0.00;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            orderAmount += parseFloat(item["total"]);
        }

        orderAmount = orderAmount * 100;


        // const orderAmount = 15;
        const { secret_key } = getKeys();



        console.log(items);
        console.log(`Order Amount: ${orderAmount}`);

        try {
            if (cvcToken && email) {
                const customers = await stripe.customers.list({
                    email,
                });

                // The list all Customers endpoint can return multiple customers that share the same email address.
                // For this example we're taking the first returned customer but in a production integration
                // you should make sure that you have the right Customer.
                if (!customers.data[0]) {
                    res.send({
                        error:
                            'There is no associated customer object to the provided e-mail',
                    });
                }

                const paymentMethods = await stripe.paymentMethods.list({
                    customer: customers.data[0].id,
                    type: 'card',
                });

                if (!paymentMethods.data[0]) {
                    res.send({
                        error: `There is no associated payment method to the provided customer's e-mail`,
                    });
                }

                const params = {
                    amount: 0.1,
                    confirm: true,
                    confirmation_method: 'manual',
                    currency,
                    payment_method: paymentMethods.data[0].id,
                    payment_method_options: {
                        card: {
                            cvc_token: cvcToken,
                        },
                    },
                    use_stripe_sdk: useStripeSdk,
                    customer: customers.data[0].id,
                };
                const intent = await stripe.paymentIntents.create(params);
                res.send(generateResponse(intent));
            } else if (paymentMethodId) {
                // Create new PaymentIntent with a PaymentMethod ID from the client.
                const params = {
                    amount: orderAmount,
                    confirm: true,
                    confirmation_method: 'manual',
                    currency,
                    payment_method: paymentMethodId,
                    // If a mobile client passes `useStripeSdk`, set `use_stripe_sdk=true`
                    // to take advantage of new authentication features in mobile SDKs.
                    use_stripe_sdk: useStripeSdk,
                };
                const intent = await stripe.paymentIntents.create(params);
                // After create, if the PaymentIntent's status is succeeded, fulfill the order.
                res.send(generateResponse(intent));
            } else if (paymentIntentId) {
                // Confirm the PaymentIntent to finalize payment after handling a required action
                // on the client.
                const intent = await stripe.paymentIntents.confirm(paymentIntentId);
                // After confirm, if the PaymentIntent's status is succeeded, fulfill the order.
                res.send(generateResponse(intent));
            }
        } catch (e) {
            // Handle "hard declines" e.g. insufficient funds, expired card, etc
            // See https://stripe.com/docs/declines/codes for more.
            res.send({ error: e.message });
        }
    }
);

router.get('/refund/:id', async function (req, res, next) {
    const refund = await stripe.refunds.create({
        charge: req.params.id,
    });

    res.json({
        "message": "OK",
        "id": req.params.id,
        "response": refund,
    });
});

module.exports = router;
