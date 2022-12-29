import { buildContractClass, Bytes, compileContract, bsv } from "scryptlib";
import { _fetch_balance, _set_credentials } from "bsvdata";
import { createRequire } from "module";
import fetch from "node-fetch";
import { MongoClient } from 'mongodb';
import { set_cmd, json_parse } from "./web/script.js";

const require = createRequire(import.meta.url);
const axios = require("axios");
const API_PREFIX = "https://api.whatsonchain.com/v1/bsv/test";

// assigning varibles
var i = 0;
var pre_tx = "This is the genesis (first) transaction";
var last_row_index = 0;
var json = require("./secrets.json"); // default path
var rand_address = [];
var private_key = [];
var db;

// fill in private key on testnet in WIF here
var privKey = ""; // Ayush Private Key
var address = ""; // Ayush Public Key
export var privateKey;

// makes the process sleep
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Converts ascii to hexa
export function ascii_to_hexa(str) {
  var arr1 = [];
  for (var n = 0, l = str.length; n < l; n++) {
    var hex = Number(str.charCodeAt(n)).toString(16);
    arr1.push(hex);
  }
  return arr1.join("");
}

let MyContract;
let instance;

export function compile(path){
  MyContract = buildContractClass(
    compileContract(path) // compiles contract
  );

  //To create an instance of the contract class
  instance = new MyContract(new Bytes("00"));
}

// assigns the instance with the required data
export function assign_msg(message) {
  message = ascii_to_hexa(message);
  instance.message = new Bytes(message);
}

// Updates MongoDB collection
export function mongodb_update(index, txid){
  db.collection("row_txid").insertOne({
    row: index,
    cur_txid: txid
  });
}

// fetches Utxos of address
export async function fetchUtxos(address) {
  let url = `${API_PREFIX}/address/${address}/unspent`
  const response = await fetch(url);
  var utxos = await response.json();
  if(!response){
    console.log('api rate limit reached\nCode went to sleep for 1 sec');
    sleep(1000);
  }

  return utxos.map((utxo) => ({
    txId: utxo.tx_hash,
    outputIndex: utxo.tx_pos,
    satoshis: utxo.value,
    script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
  }));
}

// Broadcast Transaction and return Txid
export async function sendTx(tx, address, data_json) {
  const hex = tx.toString();

  if (!tx.checkFeeRate(50)) {
    throw new Error(`checkFeeRate fail, transaction fee is too low`);
  }
  let { data: txid } = "";
  try {
    ({ data: txid } = await axios
      .post(`${API_PREFIX}/tx/raw`, { txhex: hex })
      .catch(async () => {
        i = i - 1;
        console.log("Transaction Mempool Conflict");
        return { data: "" };
      }));

    if (txid.length == 64) {
      mongodb_update(i+1, txid);
      pre_tx = txid;
      console.log("Current Address -> " + address + "\n" + i + " -> " + txid);
    }

    if (i < last_row_index - 1) {
      i++;
      update(create_msg(data_json, i), data_json);
    }

    return txid;
  } catch (error) {
    console.log(error);
    if (error.response && error.response.data === "66: insufficient priority") {
      throw new Error(
        `Rejected by miner. Transaction with fee is too low: expected Fee is ${expectedFee}, but got ${fee}, hex: ${hex}`
      );
    }
    throw error;
  }
}

// generates random array index
export function generate_random() {
  let x = Math.floor(Math.random() * 100000000 + 1);
  x = x % rand_address.length;
  return x;
}

// gets random address from array
export async function get_address() {
  let x = generate_random();
  let itr = 0;
  address = rand_address[x];
  privKey = private_key[x];

  while ((await _fetch_balance(address)) < 500 && itr < 5) {
    x = generate_random();
    address = rand_address[x];
    privKey = private_key[x];
    itr = itr + 1;
  }

  if (itr == 5 && (await _fetch_balance(address)) < 500) {
    throw new Error(`Insufficient Balance`);
  }

  return;
}

// deploys any type of contracts
export async function deployContract(contract, data_json) {
  let start = new Date().getTime();
  let cur = new Date().getTime();
  let time = [];

  await get_address();

  cur = new Date().getTime() - start;
  start = new Date().getTime();
  time.push(cur);

  privateKey = new bsv.PrivateKey.fromWIF(privKey);

  let utxos = "";
  try {
    utxos = await fetchUtxos(address);
  } catch (error) {
    await sleep(1000);
    utxos = await fetchUtxos(address);
  }
  cur = new Date().getTime() - start;
  start = new Date().getTime();
  time.push(cur);

  const tx = new bsv.Transaction();
  tx.from(utxos)
    .addOutput(
      new bsv.Transaction.Output({
        script: contract.lockingScript,
        satoshis: 0,
      })
    )
    .change(address)
    .sign(privateKey);

  await sendTx(tx, address, data_json); // Broadcast transaction

  cur = new Date().getTime() - start;
  start = new Date().getTime();
  time.push(cur);

  console.log(time);
  console.log("\n");

  return tx;
}

// deploys each row
export async function update(message, data_json) {
  var tmp = message;
  var tmp2 = "| Prev_Tx :" + pre_tx;
  assign_msg(tmp + tmp2);
  await deployContract(instance, data_json);
  return;
}

// convert dataframe row to string
export function create_msg(data, i) {
  let data_string = data[i].id + " " + data[i].file_name + " " + data[i].prediction;
  return data_string;
}

// fetches csv file and deploys on testnet
export async function fetch_api(url) {
  const response = await fetch(url);
  let data = await response.json();
  last_row_index = data.length;
  if(i >= last_row_index){
    console.log(`${i} row is out of bound`);
    throw new Error(`Out of Bounds`);
  }
  update(create_msg(data, i), data);
}

export async function update_address() {
  for (let i = 0; i < json.table.length; i++) {
    rand_address.push(json.table[i].address);
    private_key.push(json.table[i].private_key);
  }
  return;
}

// connects to mongodb server
export async function connect_mongodb(server){
  MongoClient.connect(server, { useNewUrlParser: true }, async function (err, client) { 
    if (err){
      console.log(`Connot connect to ${server}`);
      throw err;
    }
    db = client.db("rows_to_txid");
    i = await db.collection("row_txid").countDocuments();
    if(i != 0){
      pre_tx = await db.collection("row_txid").findOne({"row": i});
      pre_tx = pre_tx.cur_txid;
    }
  });
}

export async function start_upload(server, json_path, url){
  // compiles & create it's instance
  var path = "upload_data.scrypt";
  compile(path);

  await connect_mongodb(server);

  if(json_path) json = require(json_path); // use your own relative path here

  // update rand_address & private_key arrays from secrets.json | json_path
  await update_address();

  // csv file is fetched
  await fetch_api(url);
}

// fetches data by transaction hash
export async function fetch_txid_data(txid){
  var url = `https://api.whatsonchain.com/v1/bsv/test/tx/hash/${txid}`;
  const response = await fetch(url);
  var data = await response.json();
  return await json_parse(data);
}

export async function fetch_row_data(server, index){
  MongoClient.connect(server, { useNewUrlParser: true }, async function (err, client) { 
    if (err){
      console.log(`Connot connect to ${server}`);
      throw err;
    }
    db = client.db("rows_to_txid");
    var data = await db.collection("row_txid").findOne({"row": index});
    if(data == null){
      console.log(`row number ${index} is out of bound`);
      client.close();
      return;
    }
    data = data.cur_txid;
    console.log(`Transaction Hash -> ${data}`);
    set_cmd(1);
    data = await fetch_txid_data(data);
    if(data) console.log(data);
    client.close();
  });
}

// fetch_row_data("mongodb://localhost:27017", 40);
// await start_upload("mongodb://localhost:27017", "./secrets.json", "https://retoolapi.dev/veKA1F/data");