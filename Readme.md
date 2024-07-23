Shooter is a hosting service, that stores data on AWS S3 buckets and uses ECS to run containers which can build the raw github repo code. Then the built website can be hosted on a domain.

- We need to provide project gitURL and project name.
<img width="995" alt="Screenshot 2024-07-23 165402" src="https://github.com/user-attachments/assets/ab449552-4d88-4bdd-b016-e03cc92cff1c">

- then from the response we copy the id then use it to get our deployment-id.
<img width="995" alt="Screenshot 2024-07-23 165425" src="https://github.com/user-attachments/assets/37dc59f7-fc01-4a9f-a41d-ca2ae693b753">

- to view real-time logs of the project we can access the project id to get logs.
<img width="995" alt="Screenshot 2024-07-23 165454" src="https://github.com/user-attachments/assets/f1b2ba36-2c41-4076-b28a-6485c4787d53">

- then the deployed project can be viewed from the deployment url. <hr/>
Still need to implement a frontend for this project.
