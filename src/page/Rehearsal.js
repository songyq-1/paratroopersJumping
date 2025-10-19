'use client';  

import React, { useRef, useEffect } from 'react';  
import * as THREE from 'three';  
import { OrbitControls } from 'three/addons/controls/OrbitControls';  

function Rehearsal() {  
  const containerRef = useRef(null);  
  const startTimeRef = useRef(null); // 记录动画开始时间，用于计算延迟

  useEffect(() => {  
    // 1. 基础场景配置（场景、相机、渲染器、控制器、光源）
    const scene = new THREE.Scene();  
    scene.background = new THREE.Color(0x95a5a6);  

    const camera = new THREE.PerspectiveCamera(  
      75,  
      window.innerWidth / window.innerHeight,  
      0.1,  
      1000  
    );  
    camera.position.set(0, 15, 40);  

    const renderer = new THREE.WebGLRenderer({ antialias: true });  
    renderer.setSize(window.innerWidth, window.innerHeight);  
    containerRef.current.appendChild(renderer.domElement);  

    const controls = new OrbitControls(camera, renderer.domElement);  
    controls.enableDamping = true;  

    // 环境光+平行光，保证小球阴影和亮度
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);  
    scene.add(ambientLight);  
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);  
    directionalLight.position.set(10, 20, 15);  
    scene.add(directionalLight);  


    // 2. 地面和边界（不变逻辑）
    // 地面：棕色平面，位置y=-5（小球落地时y=-4.5，与地面有微小贴合）
    const groundGeometry = new THREE.BoxGeometry(60, 0.1, 60);  
    const groundMaterial = new THREE.MeshStandardMaterial({  
      color: 0x8B4513,  
      roughness: 0.8,  
      metalness: 0.2  
    });  
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);  
    ground.position.y = -5;  
    scene.add(ground);  

    // 边界：透明线框，限制小球活动范围
    const boundarySize = 40;  
    const boundaryGeometry = new THREE.BoxGeometry(boundarySize, 30, boundarySize);  
    const boundaryMaterial = new THREE.MeshBasicMaterial({  
      color: 0x000000,  
      wireframe: true,  
      opacity: 0.2,  
      transparent: true  
    });  
    const boundary = new THREE.Mesh(boundaryGeometry, boundaryMaterial);  
    scene.add(boundary);  


    // 3. 小球创建：核心新增「下落延迟」和「状态冻结」逻辑
    const balls = [];  
    const ballCount = 80;        // 小球总数
    const ballRadius = 0.5;      // 小球半径
    const oneBodyLength = ballRadius * 2; // 小球直径（用于分组判断）
    const dropInterval = 100;    // 小球下落间隔（毫秒）：值越小，下落越密集

    for (let i = 0; i < ballCount; i++) {  
      // 小球几何与材质（彩色+高光，更易区分）
      const geometry = new THREE.SphereGeometry(ballRadius, 32, 32);  
      const material = new THREE.MeshPhongMaterial({  
        color: new THREE.Color(Math.random() * 0xffffff),  
        shininess: 80,  
        specular: 0xffffff  
      });  
      const ball = new THREE.Mesh(geometry, material);  

      // 初始位置：仅在x/z方向随机（y方向固定高度，避免天上时位置偏移）
      ball.position.set(  
        (Math.random() - 0.5) * (boundarySize - ballRadius * 2), // x：边界内随机
        15, // y：固定高度（所有小球天上时在同一水平，更整齐）
        (Math.random() - 0.5) * (boundarySize - ballRadius * 2)  // z：边界内随机
      );  

      // 小球物理属性：新增「dropTime」控制下落触发时间
      ball.userData = {  
        velocity: { x: 0, y: 0, z: 0 }, // 初始速度为0（天上时不动）
        rotationSpeed: { x: 0, y: 0, z: 0 }, // 初始旋转为0（天上时不转）
        isOnGround: false,  // 是否落地
        syncGroup: null,    // 分组ID（落地后用于同步运动）
        leader: null,       // 分组领导者（落地后跟随）
        dropTime: i * dropInterval, // 第i个小球的下落触发时间（依次延迟）
        offsetToLeader: null // 与领导者的相对位置（落地后计算）
      };  

      scene.add(ball);  
      balls.push(ball);  
    }  


    // 4. 物理参数与工具函数（不变逻辑）
    const gravity = 0.03;     // 重力加速度
    const friction = 0.995;   // 地面摩擦力（避免小球无限加速）
    const bounceFactor = 0.7; // 落地反弹系数（0=不反弹，1=完全反弹）

    // 检测小球是否落地（y≤-4.5即判定为落地）
    const checkOnGround = (ball) => {  
      ball.userData.isOnGround = ball.position.y <= -4.5 + 0.05;  
    };  

    // 动态分组：落地后，距离<1个直径的小球分为一组，选速度最大的为领导者
    const updateSyncGroups = () => {  
      balls.forEach(ball => ball.userData.syncGroup = ball.userData.isOnGround ? null : ball.userData.syncGroup);  

      let groupId = 0;  
      balls.filter(ball => ball.userData.isOnGround).forEach(ball => {  
        if (ball.userData.syncGroup !== null) return;  

        // 寻找同区域的落地小球
        const groupCandidates = [ball];  
        balls.filter(other =>  
          other.userData.isOnGround &&  
          other !== ball &&  
          other.userData.syncGroup === null &&  
          ball.position.distanceTo(other.position) < oneBodyLength  
        ).forEach(other => groupCandidates.push(other));  

        // 选速度最大的为领导者
        const leader = groupCandidates.reduce((max, curr) => {  
          const currSpeed = Math.hypot(curr.userData.velocity.x, curr.userData.velocity.z);  
          const maxSpeed = Math.hypot(max.userData.velocity.x, max.userData.velocity.z);  
          return currSpeed > maxSpeed ? curr : max;  
        }, groupCandidates[0]);  

        // 分配分组信息
        groupCandidates.forEach(member => {  
          member.userData.syncGroup = groupId;  
          member.userData.leader = leader;  
        });  
        groupId++;  
      });  
    };  

    // 分组同步：非领导者小球跟随领导者的速度和位置
    const syncGroupMovement = () => {  
      balls.forEach(ball => {  
        if (!ball.userData.isOnGround || !ball.userData.leader || ball.userData.leader === ball) return;  

        const leader = ball.userData.leader;  
        // 首次同步时记录与领导者的相对位置
        if (!ball.userData.offsetToLeader) {  
          ball.userData.offsetToLeader = new THREE.Vector3().subVectors(ball.position, leader.position);  
        }  

        // 跟随领导者的速度和旋转
        ball.userData.velocity.x = leader.userData.velocity.x;  
        ball.userData.velocity.z = leader.userData.velocity.z;  
        ball.userData.rotationSpeed = { ...leader.userData.rotationSpeed };  

        // 基于领导者位置更新自身位置（保持队形）
        ball.position.x = leader.position.x + ball.userData.offsetToLeader.x;  
        ball.position.z = leader.position.z + ball.userData.offsetToLeader.z;  
      });  
    };  


    // 5. 动画循环：核心逻辑——按时间触发下落，未触发时冻结状态
    startTimeRef.current = Date.now(); // 记录动画启动时间
    const animate = () => {  
      const elapsedTime = Date.now() - startTimeRef.current; // 已流逝时间
      requestAnimationFrame(animate);  

      // 遍历所有小球，按状态处理
      balls.forEach(ball => {  
        const { dropTime, isOnGround, velocity, rotationSpeed } = ball.userData;  

        // 状态1：未到下落时间（天上不动）——冻结所有变化
        if (elapsedTime < dropTime) {  
          return; // 直接跳过位移、旋转、重力逻辑，小球保持初始状态
        }  

        // 状态2：已到下落时间（开始运动）——执行正常物理逻辑
        // ① 空中运动：应用重力和落地反弹
        if (!isOnGround) {  
          velocity.y -= gravity; // 重力下拉
          ball.position.y += velocity.y; // 更新y轴位置

          // 落地检测：碰到地面时反弹
          if (ball.position.y < -4.5) {  
            ball.position.y = -4.5; // 防止小球陷入地面
            velocity.y = -velocity.y * bounceFactor; // 反弹（反向+衰减）
            // 落地时赋予随机水平速度和旋转（让落地后有运动）
            velocity.x = (Math.random() - 0.5) * 0.6;  
            velocity.z = (Math.random() - 0.5) * 0.6;  
            rotationSpeed.x = (Math.random() - 0.5) * 0.04;  
            rotationSpeed.y = (Math.random() - 0.5) * 0.04;  
            rotationSpeed.z = (Math.random() - 0.5) * 0.04;  
          }  
        } 
        // 状态3：已落地——应用地面摩擦力
        else {  
          velocity.x *= friction; // 水平速度逐渐衰减
          velocity.z *= friction;  
        }  

        // ② 边界碰撞：防止小球超出线框边界
        const halfBoundary = boundarySize / 2 - ballRadius;  
        ['x', 'z'].forEach(axis => {  
          if (ball.position[axis] > halfBoundary) {  
            ball.position[axis] = halfBoundary;  
            velocity[axis] = -velocity[axis] * 0.8; // 碰到边界反弹
          } else if (ball.position[axis] < -halfBoundary) {  
            ball.position[axis] = -halfBoundary;  
            velocity[axis] = -velocity[axis] * 0.8;  
          }  
        });  

        // ③ 更新位置和旋转（仅已触发下落的小球执行）
        ball.position.x += velocity.x;  
        ball.position.z += velocity.z;  
        ball.rotation.x += rotationSpeed.x;  
        ball.rotation.y += rotationSpeed.y;  
        ball.rotation.z += rotationSpeed.z;  

        // ④ 检测是否落地（更新状态）
        checkOnGround(ball);  
      });  

      // 落地小球分组同步（不影响天上的小球）
      updateSyncGroups();  
      syncGroupMovement();  

      // 控制器更新和渲染
      controls.update();  
      renderer.render(scene, camera);  
    };  

    // 窗口 resize 适配
    const handleResize = () => {  
      camera.aspect = window.innerWidth / window.innerHeight;  
      camera.updateProjectionMatrix();  
      renderer.setSize(window.innerWidth, window.innerHeight);  
    };  
    window.addEventListener('resize', handleResize);  

    // 启动动画
    animate();  

    // 组件卸载时清理资源
    return () => {  
      window.removeEventListener('resize', handleResize);  
      containerRef.current?.removeChild(renderer.domElement);  
      renderer.dispose();  
    };  
  }, []);  

  return (  
    <div  
      ref={containerRef}  
      style={{  
        position: 'fixed',  
        top: 0,  
        left: 0,  
        width: '100%',  
        height: '100%',  
        pointerEvents: 'auto' // 确保OrbitControls能接收鼠标事件
      }}  
    />  
  );  
}  

export default Rehearsal;