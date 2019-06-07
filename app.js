(function () { //estamos usando uma função de invocação imediata (IIFE), como forma de encapsulamento, https://pedrotcaraujo.github.io/2014/12/01/funcoes-imediatas-IIFE/
    'use strict' //instruindo a minha aplicação a utilizar o padrão ES6
    const express = require('express');
    const bodyParser = require('body-parser');
    const config = require('./config');
    const apiai = require('apiai');
    const uuid = require('uuid');
    const axios = require('axios');
    const app = express();
    const PORT = process.env.PORT || 5000;  //definição da porta de funcionamento, se estiver utilizando o heroku, ele fará a seleção da porta
    
    //Aqui fazemos com que o server escute uma porta de funcionamento, no meu caso definida acima como 5000;
    app.listen( PORT , () => {
      console.log('funcionando na porta: ', PORT);
    });
    
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(express.static('public'));
   
    /*é nescessário que o facebook tenha a noção de que o Dialogflow está
    fazendo o processamento da lingaguem natural, isso leva um tempo,
    assim temos que enviar a ação typing_on, para que ele saiba o que
    está acontecendo, se não o fizermos, o facebook fica realizando muitas
    requisições e isso irá estoura a memória*/
    const sendTypingOn = (recipientId) => {
      let messageData = {
        recipient: {
          id: recipientId
        },
        sender_action: 'typing_on'
      };
      enviarFacebook(messageData);
    }
  
    /*Com essa função o facebook sabe que o processamento acabou, e
    agora será enviado uma resposta*/
    const sendTypingOff = (recipientId) => {
      let messageData = {
        recipient: {
          id: recipientId
        },
        sender_action: 'typing_off'
      };
      enviarFacebook(messageData);
    }
  
    /*Aqui serão colocados os ids do usuário, para enviarmos pro
    Dialogflow*/
    const sessionIds = new Map();
  
    /*função para verificar se existe, se é null ou se é undefine a resposta(response) que recebemos do Dialogflow*/
    const isDefined = (obj) => {
      if (typeof obj == 'undefined') {
        return false;
      }
      if (!obj) {
        return false;
      }
      return obj != null;
    }
  
    /*Aqui estamos setando as configurações que iremos enviar para o
    Dialogflow, com o idioma do seu agent e o token de acesso dele*/
    const DialogflowService = apiai(config.API_AI_CLIENT_ACCESS_TOKEN, {
      language: 'pt-BR',
      requestSource: 'fb'
    })
    /*Nas linha abaixo usamos um get na rota '/', para verificar o funcionamento da aplicação*/
    app.get('/', (req, res) => {
      res.send('Funcionando!');
    });
  
    /*A função abaixo faz uma requisição na url utilizada pelo ngrok, utilizando o webhook, 
    assim o facebook poderá fazer a verificação do token de verificação, para permitir a 
    emissão de dados*/
    app.get('/webhook', (req, res) => {
  
      console.log('request');
  
      if (
        req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN
      ) {
        res.status(200).send(req.query['hub.challenge']);
      } else {
        console.error('Failed validation. Make sure the validation tokens match.');
        res.sendStatus(403);
      }
  
    });
  
    /*As funções acima nos deram permissão para receber a mensagem do usuário do facebook. Com a função abaixo podemos quebrar essa requisição em várias partes, todavia pegaremos apenas o id do usuário e o texto enviado pelo mesmo*/
    app.post('/webhook', async (req, res) => {
      let data = req.body;
      const senderId = data.entry[0].messaging[0].sender.id;
      const texto = data.entry[0].messaging[0].message.text;
      await enviarDialogflow(senderId, texto);
      res.sendStatus(200);
    })
  
    /*Essa função envia uma requisição para o Dialogflow, com o objetivo
    de conseguir uma resposta com o texto que será enviado para o
    usuário*/
    function enviarDialogflow (senderId, texto) {
      sendTypingOn(senderId);
      if (!sessionIds.has(senderId)) {
        sessionIds.set(senderId, uuid.v1());
      }
      //Aqui é feita a requisição, que tem uam função response
      let requestDialogflow = DialogflowService.textRequest(texto, { 
        sessionId: sessionIds.get(senderId)
      });
      /*Aqui chamamos a função response conferindo se ela existe e
      pegando as suas variáveis*/
      requestDialogflow.on('response', async response => {
        if (isDefined(response.result)) {
          await decodeDialogflowResponse (senderId, response);
        }
      });
      /*caso o response não exista, então será gerado um erro, e devemos
      cancelar a requisição para que o bot não pare de funcionar*/
      requestDialogflow.on('error', error => console.log(error));
      requestDialogflow.end();//cancelamento da requisição
    }
    
    /*Essa função irá quebrar o response em suas diversas propriedades, 
    estas serão usadas, para os fins desse tutorial, para enviar a 
    mensagem de resposta, e verificar as actions que foram utilizadas. 
    Existem outras informações dentro do response como: contexts, 
    parameters, data, etc*/
    async function decodeDialogflowResponse (senderId, response) {
      sendTypingOff(senderId);
      const userText = response.result.resolvedQuery;
      const action = response.result.action
      const responseText = response.result.fulfillment.speech
      await gerarDadosDaMensagem(senderId, responseText);
    }
  
    /*O facebook recebe os dados de uma maneira única que pode ser encontrada em: 
    https://developers.facebook.com/docs/messenger-platform/reference/send-api# 
    Nesse caso nosso envio aborda recipient com id e o message com text.
    */
    async function gerarDadosDaMensagem(senderId, texto) {
      let DadosDaMensagem = {
        recipient: {
          id: senderId
        },
        message: {
          text: texto
        }
      };
      await enviarFacebook(DadosDaMensagem);
    }
  
    /*Após estruturarmos a mensagem poderemos evniá-la, isso é o que essa função faz. Usando a url da graph API, uma api que o facebook usa para receber e enviar mensagens, com a config do token de autorização da sua página no face e usando o axios para posta a mensagem na url*/
    async function enviarFacebook(DadosDaMensagem) {
      const url = 'https://graph.facebook.com/v3.0/me/messages?access_token=' + config.FB_PAGE_TOKEN;
      await axios.post(url, DadosDaMensagem);
    }
  
  })();