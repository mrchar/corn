package net.mrchar.corn.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Getter;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Getter
@Entity
@Table(name = "space")
@EntityListeners(AuditingEntityListener.class)
public class Space {
    @Id
    @Column(name = "id", columnDefinition = "bigint")
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "code")
    private String code;

    @Column(name = "name")
    private String name;

    @JsonIgnore
    @CreatedDate
    @Column(name = "created")
    private LocalDateTime created;

    @JsonIgnore
    @LastModifiedDate
    @Column(name = "modified")
    private LocalDateTime modified;

    public Space() {
    }

    public Space(String code, String name) {
        this.code = code;
        this.name = name;
    }
}
