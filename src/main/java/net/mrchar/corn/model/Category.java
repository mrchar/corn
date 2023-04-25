package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(name = "category")
@EntityListeners(AuditingEntityListener.class)
public class Category {
    @Id
    @Column(name = "id")
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "code")
    private String code;

    @Column(name = "name")
    private String name;

    @Column(name = "unit")
    private String unit;

    @CreatedDate
    @Column(name = "created", columnDefinition = "TIMESTAMP")
    private LocalDateTime created;

    @LastModifiedDate
    @Column(name = "modified", columnDefinition = "TIMESTAMP")
    private LocalDateTime modified;

    public Category() {
    }

    public Category(String code, String name) {
        this.code = code;
        this.name = name;
    }
}
