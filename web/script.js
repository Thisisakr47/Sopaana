let url_api = 'https://api.whatsonchain.com/v1/bsv/test/tx/hash/';
let prev_tx = "";
let cmd;

function set_cmd(value){
    cmd = value;
    return;
}

function show(a){
    let txn_id = "c3a3bb1cefd8be279334e5c3573e243e9253e9dedf0ee613d669896ded1a8ecd";
    cmd = 0;
    if(!a) txn_id = document.getElementById('txn_hash').value;
    fetch_api(url_api + txn_id);
}

async function fetch_api(url){
    const response = await fetch(url);
    var data = await response.json();
    if(response) json_parse(data);
}

// converts hex to ascii string
function hex2a(hexx){
    var hex = hexx.toString();
    var str = '';
    for (var i = 0; i < hex.length; i += 2) str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

// finds string s in the array 
function check(s){
    return s == "OP_RETURN";
}

// extracts hex from the json
async function json_parse(out){

    // extract the asm from the json
    let txn_asm = out.vout[0].scriptPubKey.asm;

    // split the asm string into array of strings
    let arr = txn_asm.split(" ");

    // The hex of our uploaded_data (row)
    let ln = arr.findIndex(check);
    let txn_hex = arr[ln + 2];

    // convert the hex to ascii string
    let ans = hex2a(txn_hex);
    // console.log(ans);

    // backtracks to the previous transaction_id
    arr = ans.split("|");
    let prev_txn_arr = arr[arr.length - 1].split(":");
    prev_tx = prev_txn_arr[prev_txn_arr.length - 1]
    prev_tx_tmp = prev_tx;
    if(!cmd){
        ans = "<b>Your Data</b><br><br>";
        prev_tx = "<b> Prev. Txn Hash</b><br>" + "<div id = " + '"txid"' + ">" + prev_tx + "</div>";
        for(let i = 0; i < arr.length - 1; i++) {
            ans += arr[i] + "<br>";
        }
        document.getElementById('data_content').innerHTML = ans;
        document.getElementById('prev_txn').innerHTML = prev_tx;
    }
    else return arr;
}

module.exports = {
    show,
    set_cmd,
    json_parse,
};