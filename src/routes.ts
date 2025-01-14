import express, { Request, Response } from 'express';
import EndpointAgentCustomGermanController from './endpointCustomAgentGerman';

const router = express.Router();

router.get('/', async (_req, res) => {
    return res.send("Server is up and running!\nUse [URL]/docs to access the swagger UI.");
});

router.post('/agentcustomgerman', async (_req, res) => {
    const controller = new EndpointAgentCustomGermanController();
    console.log(_req.body)
    console.log(_req.headers)
    
    const response = await controller.postResponse(_req.body);
    return res.send(response);
  
});

export default router;
