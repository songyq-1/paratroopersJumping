'use client';  

import React, { useRef, useEffect } from 'react';  
import * as THREE from 'three';  
import { OrbitControls } from 'three/addons/controls/OrbitControls';  

function Rehearsal() {  
  const containerRef = useRef(null);  

  useEffect(() => {  
    // 场景设置  
    const scene = new THREE.Scene();  
    scene.background = new THREE.Color(0x95a5a6);  
    
    // 相机设置  
    const camera = new THREE.PerspectiveCamera(  
      75,   
      window.innerWidth / window.innerHeight,  
      0.1,  
      1000  
    );  
    camera.position.set(0, 15, 40);  
    
    // 渲染器设置  
    const renderer = new THREE.WebGLRenderer({ antialias: true });  
    renderer.setSize(window.innerWidth, window.innerHeight);  
    containerRef.current.appendChild(renderer.domElement);  
    
    // 轨道控制器  
    const controls = new OrbitControls(camera, renderer.domElement);  
    controls.enableDamping = true;  
    
    // 光源  
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);  
    scene.add(ambientLight);  
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);  
    directionalLight.position.set(10, 20, 15);  
    scene.add(directionalLight);  
    
    // 地面（带轻微摩擦力，避免无限加速）  
    const groundGeometry = new THREE.BoxGeometry(60, 0.1, 60);  
    const groundMaterial = new THREE.MeshStandardMaterial({  
      color: 0x8B4513,  
      roughness: 0.8,  
      metalness: 0.2  
    });  
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);  
    ground.position.y = -5;  
    scene.add(ground);  
    
    // 边界设置  
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
    
    // 创建小球  
    const balls = [];  
    const ballCount = 80;  
    const ballRadius = 0.5;  
    const oneBodyLength = ballRadius * 2; // 1个身位 = 小球直径  
    
    for (let i = 0; i < ballCount; i++) {  
      const geometry = new THREE.SphereGeometry(ballRadius, 32, 32);  
      const material = new THREE.MeshPhongMaterial({  
        color: new THREE.Color(Math.random() * 0xffffff),  
        shininess: 80,  
        specular: 0xffffff  
      });  
      
      const ball = new THREE.Mesh(geometry, material);  
      ball.position.set(  
        (Math.random() - 0.5) * (boundarySize - ballRadius * 2),  
        8 + Math.random() * 12,  
        (Math.random() - 0.5) * (boundarySize - ballRadius * 2)  
      );  
      
      // 物理属性：增加基础速度和分组信息  
      ball.userData = {  
        velocity: {  
          y: 0,  
          x: (Math.random() - 0.5) * 0.4,  // 初始水平速度  
          z: (Math.random() - 0.5) * 0.4   // 初始水平速度  
        },  
        rotationSpeed: {  
          x: (Math.random() - 0.5) * 0.02,  
          y: (Math.random() - 0.5) * 0.02,  
          z: (Math.random() - 0.5) * 0.02  
        },  
        isOnGround: false, // 是否接触地面（而非静止）  
        syncGroup: null,   // 同步组ID  
        leader: null       // 跟随的领导者  
      };  
      
      scene.add(ball);  
      balls.push(ball);  
    }  
    
    // 物理参数  
    const gravity = 0.03;  
    const friction = 0.995; // 轻微摩擦，避免速度无限增大  
    const bounceFactor = 0.7; // 地面反弹系数  
    
    // 检测小球是否接触地面  
    const checkOnGround = (ball) => {  
      ball.userData.isOnGround = ball.position.y <= -4.5 + 0.05;  
    };  
    
    // 动态分组：将距离小于1个身位的小球分为一组，选速度最大的为 leader  
    const updateSyncGroups = () => {  
      // 重置分组（保留leader引用用于计算）  
      balls.forEach(ball => {  
        if (ball.userData.isOnGround) {  
          ball.userData.syncGroup = null;  
        }  
      });  

      let groupId = 0;  
      // 遍历所有接触地面的小球  
      balls.filter(ball => ball.userData.isOnGround).forEach(ball => {  
        if (ball.userData.syncGroup !== null) return;  

        // 寻找所有近距离邻居  
        const groupCandidates = [ball];  
        balls.filter(other =>  
          other.userData.isOnGround &&  
          other !== ball &&  
          other.userData.syncGroup === null &&  
          ball.position.distanceTo(other.position) < oneBodyLength  
        ).forEach(other => {  
          groupCandidates.push(other);  
        });  

        // 选择组内速度最大的小球作为leader（保证运动性）  
        const leader = groupCandidates.reduce((max, curr) => {  
          const currSpeed = Math.hypot(curr.userData.velocity.x, curr.userData.velocity.z);  
          const maxSpeed = Math.hypot(max.userData.velocity.x, max.userData.velocity.z);  
          return currSpeed > maxSpeed ? curr : max;  
        }, groupCandidates[0]);  

        // 分配组ID和leader  
        groupCandidates.forEach(member => {  
          member.userData.syncGroup = groupId;  
          member.userData.leader = leader;  
        });  

        groupId++;  
      });  
    };  
    
    // 同步组内小球运动：跟随leader速度，保持相对位置  
    const syncGroupMovement = () => {  
      balls.forEach(ball => {  
        if (!ball.userData.isOnGround || !ball.userData.leader || ball.userData.leader === ball) {  
          return; // 非地面小球/leader自身不处理  
        }  

        const leader = ball.userData.leader;  
        // 计算与leader的初始相对位置（首次同步时记录）  
        if (!ball.userData.offsetToLeader) {  
          ball.userData.offsetToLeader = new THREE.Vector3().subVectors(  
            ball.position,  
            leader.position  
          );  
        }  

        // 继承leader的速度和旋转  
        ball.userData.velocity.x = leader.userData.velocity.x;  
        ball.userData.velocity.z = leader.userData.velocity.z;  
        ball.userData.rotationSpeed = { ...leader.userData.rotationSpeed };  

        // 基于leader位置和相对偏移更新自身位置（保持队形）  
        ball.position.x = leader.position.x + ball.userData.offsetToLeader.x;  
        ball.position.z = leader.position.z + ball.userData.offsetToLeader.z;  
      });  
    };  
    
    // 动画循环  
    const animate = () => {  
      requestAnimationFrame(animate);  
      
      // 1. 更新所有小球物理状态（未分组状态）  
      balls.forEach(ball => {  
        // 处理空中运动  
        if (!ball.userData.isOnGround) {  
          ball.userData.velocity.y -= gravity;  
          ball.position.y += ball.userData.velocity.y;  
          
          // 地面碰撞检测  
          if (ball.position.y < -4.5) {  
            ball.position.y = -4.5;  
            ball.userData.velocity.y = -ball.userData.velocity.y * bounceFactor;  
          }  
        } else {  
          // 地面运动：应用轻微摩擦，保持持续运动  
          ball.userData.velocity.x *= friction;  
          ball.userData.velocity.z *= friction;  
        }  

        // 边界碰撞（确保在范围内运动）  
        const halfBoundary = boundarySize / 2 - ballRadius;  
        ['x', 'z'].forEach(axis => {  
          if (ball.position[axis] > halfBoundary) {  
            ball.position[axis] = halfBoundary;  
            ball.userData.velocity[axis] = -ball.userData.velocity[axis] * 0.8; // 边界反弹  
          } else if (ball.position[axis] < -halfBoundary) {  
            ball.position[axis] = -halfBoundary;  
            ball.userData.velocity[axis] = -ball.userData.velocity[axis] * 0.8;  
          }  
        });  

        // 更新位置和旋转（无论是否在地面）  
        ball.position.x += ball.userData.velocity.x;  
        ball.position.z += ball.userData.velocity.z;  
        ball.rotation.x += ball.userData.rotationSpeed.x;  
        ball.rotation.y += ball.userData.rotationSpeed.y;  
        ball.rotation.z += ball.userData.rotationSpeed.z;  

        // 检测是否接触地面  
        checkOnGround(ball);  
      });  

      // 2. 动态分组（每帧更新，支持临时靠近的小球）  
      updateSyncGroups();  

      // 3. 同步组内运动（确保相邻小球轨迹一致）  
      syncGroupMovement();  

      controls.update();  
      renderer.render(scene, camera);  
    };  
    
    // 窗口大小调整  
    const handleResize = () => {  
      camera.aspect = window.innerWidth / window.innerHeight;  
      camera.updateProjectionMatrix();  
      renderer.setSize(window.innerWidth, window.innerHeight);  
    };  
    
    window.addEventListener('resize', handleResize);  
    animate();  
    
    // 清理  
    return () => {  
      window.removeEventListener('resize', handleResize);  
      containerRef.current.removeChild(renderer.domElement);  
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
        height: '100%'   
      }}  
    />  
  );  
}  

export default Rehearsal;